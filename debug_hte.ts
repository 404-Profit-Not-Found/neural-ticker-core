
import { DataSource } from "typeorm";
import { TickerEntity as Ticker } from "./src/modules/tickers/entities/ticker.entity";
import { PortfolioPosition } from "./src/modules/portfolio/entities/portfolio-position.entity";
import { config } from "dotenv";

config();

const AppDataSource = new DataSource({
    type: "sqlite",
    database: "neural-ticker.db",
    entities: [Ticker, PortfolioPosition],
    synchronize: false,
});

async function debugData() {
    await AppDataSource.initialize();
    
    const tickerRepo = AppDataSource.getRepository(Ticker);
    const positionRepo = AppDataSource.getRepository(PortfolioPosition);

    const symbol = "DTE.DE";

    console.log(`--- DEBUGGING ${symbol} ---`);

    // 1. Check Ticker
    const ticker = await tickerRepo.findOne({ where: { symbol } });
    if (ticker) {
        console.log(`TICKER: ${ticker.symbol} | Currency: ${ticker.currency} | Exchange: ${ticker.exchange}`);
    } else {
        console.log("TICKER: Not found");
    }

    // 2. Check Positions
    const positions = await positionRepo.find({ where: { symbol } });
    for (const p of positions) {
        console.log(`POSITION: ID=${p.id} | Symbol=${p.symbol} | Currency=${p.currency} | Algo=${p.buy_price}`);
    }

    await AppDataSource.destroy();
}

debugData().catch(console.error);
