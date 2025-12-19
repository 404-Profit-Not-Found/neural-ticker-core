import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MarketDataService } from '../src/modules/market-data/market-data.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const marketDataService = app.get(MarketDataService);

  const symbols = ['AAPL', 'SOI.PA'];
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();

  for (const symbol of symbols) {
    console.log(`\n--- Testing Direct History for ${symbol} ---`);
    try {
      const history = await marketDataService.getHistory(symbol, '1d', from, to);
      console.log(`Success! Received ${history.length} data points.`);
      if (history.length > 0) {
        console.log('First point:', {
          ts: history[0].ts,
          close: history[0].close,
          source: history[0].source
        });
      }
    } catch (e) {
      console.error(`Error for ${symbol}:`, e.message);
    }
  }

  await app.close();
}

bootstrap();
