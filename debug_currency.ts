
import { DataSource } from "typeorm";
import { TickerEntity as Ticker } from "./src/modules/tickers/entities/ticker.entity";
import { PortfolioPosition } from "./src/modules/portfolio/entities/portfolio-position.entity";
import { config } from "dotenv";

config();

async function main() {
    const dataSource = new DataSource({
        type: "postgres",
        url: process.env.DATABASE_URL,
        entities: [Ticker, PortfolioPosition],
        extra: {
            ssl: { rejectUnauthorized: false }
        }
    });

    await dataSource.initialize();

    const symbol = "DTE.DE"; // Or any other symbol
    console.log(`Checking ${symbol}...`);

    const tickerRepo = dataSource.getRepository(Ticker);
    const ticker = await tickerRepo.findOne({ where: { symbol } });
    console.log("Ticker Table:", ticker ? { symbol: ticker.symbol, exchange: ticker.exchange, currency: ticker.currency } : "Not Found");

    const posRepo = dataSource.getRepository(PortfolioPosition);
    // @ts-ignore
    const positions = await posRepo.find({ where: { symbol }, relations: ['ticker'] });
    
    positions.forEach(p => {
        // Safe access with any cast if needed, though relation should load if defined
        const tickerCurr = (p as any).ticker?.currency;
        console.log(`Position: ${p.symbol}, Position Currency: ${p.currency}, Ticker Currency: ${tickerCurr}`);
    });

    await dataSource.destroy();
}

main().catch(console.error);
