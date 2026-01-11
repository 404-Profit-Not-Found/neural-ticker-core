import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME ?? process.env.POSTGRES_USER ?? 'admin',
  password: process.env.DB_PASSWORD ?? process.env.POSTGRES_PASSWORD,
  database: process.env.DB_DATABASE,
  synchronize: false,
  logging: true,
  entities: [join(__dirname, '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  subscribers: [],
  ssl:
    process.env.DB_SSL === 'false'
      ? false
      : (process.env.DATABASE_URL &&
          process.env.DATABASE_URL.includes('sslmode=require')) ||
        process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
});
