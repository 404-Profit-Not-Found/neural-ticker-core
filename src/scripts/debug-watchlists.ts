
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';
import { User } from '../modules/users/entities/user.entity';
import { Watchlist } from '../modules/watchlist/entities/watchlist.entity';

config();

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [join(__dirname, '..', 'modules', '**', '*.entity.ts')],
  synchronize: false,
});

async function run() {
  await dataSource.initialize();
  console.log('Database connected.');

  const users = await dataSource.getRepository(User).find();
  console.log(`Found ${users.length} users.`);

  for (const user of users) {
    console.log(`\nUser: ${user.email} (ID: ${user.id})`);
    
    const watchlists = await dataSource.getRepository(Watchlist).find({
      where: { user_id: user.id },
      relations: ['items', 'items.ticker'],
    });

    if (watchlists.length === 0) {
      console.log('  No watchlists found.');
      continue;
    }

    for (const list of watchlists) {
      console.log(`  Watchlist: "${list.name}" (ID: ${list.id})`);
      const alvoItems = list.items.filter(i => i.ticker.symbol === 'ALVO');
      
      if (list.items.length === 0) {
        console.log('    (Empty)');
      } else {
        console.log(`    Total Items: ${list.items.length}`);
        list.items.forEach(item => {
             console.log(`      - ${item.ticker.symbol} (ItemID: ${item.id}, TickerID: ${item.ticker.id})`);
        });
      }

      if (alvoItems.length > 0) {
        console.warn(`    ⚠️ ALVO FOUND in "${list.name}"! ItemIDs: ${alvoItems.map(i => i.id).join(', ')}`);
      }
    }
  }

  await dataSource.destroy();
}

run().catch(err => console.error(err));
