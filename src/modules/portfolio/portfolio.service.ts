import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioPosition } from './entities/portfolio-position.entity';
import { CreatePortfolioPositionDto } from './dto/create-portfolio-position.dto';
import { UpdatePortfolioPositionDto } from './dto/update-portfolio-position.dto';
import { MarketDataService } from '../market-data/market-data.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(PortfolioPosition)
    private readonly positionRepo: Repository<PortfolioPosition>,
    private readonly marketDataService: MarketDataService,
    private readonly llmService: LlmService,
  ) {}

  async create(userId: string, dto: CreatePortfolioPositionDto): Promise<PortfolioPosition> {
    const position = this.positionRepo.create({
      ...dto,
      user_id: userId,
    });
    return this.positionRepo.save(position);
  }

  async findAll(userId: string): Promise<any[]> {
    const positions = await this.positionRepo.find({
      where: { user_id: userId },
      order: { symbol: 'ASC' },
    });

    // Enrich with current market data
    const symbols = positions.map((p) => p.symbol);
    if (symbols.length === 0) return [];

    // Ideally, we'd use a bulk fetch here. Reusing getQuotes from MarketDataService would be best if it supported bulk.
    // For MVP, we'll fetch individually or implement a bulk endpoint in MarketDataService later.
    // Let's assume we fetch sequentially for now (optimize later).
    
    // Better: MarketDataService.getQuote receives one symbol.
    // TODO: Optimize with bulk quote fetch
    
    const enriched = await Promise.all(
        positions.map(async (pos) => {
            let currentPrice = pos.buy_price; // Fallback
            try {
                const quote = await this.marketDataService.getQuote(pos.symbol);
                if (quote) {
                    currentPrice = quote.c;
                }
            } catch (e) {
                // ignore error
            }

            const currentValue = Number(pos.shares) * currentPrice;
            const costBasis = Number(pos.shares) * Number(pos.buy_price);
            const gainLoss = currentValue - costBasis;
            const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

            return {
                ...pos,
                current_price: currentPrice,
                current_value: currentValue,
                cost_basis: costBasis,
                gain_loss: gainLoss,
                gain_loss_percent: gainLossPercent
            };
        })
    );

    return enriched;
  }

  async findOne(userId: string, id: string): Promise<PortfolioPosition> {
    const position = await this.positionRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!position) {
      throw new NotFoundException(`Position not found`);
    }
    return position;
  }

  async update(userId: string, id: string, dto: UpdatePortfolioPositionDto): Promise<PortfolioPosition> {
    const position = await this.findOne(userId, id);
    Object.assign(position, dto);
    return this.positionRepo.save(position);
  }

  async remove(userId: string, id: string): Promise<void> {
    const position = await this.findOne(userId, id);
    await this.positionRepo.remove(position);
  }

  async analyzePortfolio(userId: string, riskAppetite: string): Promise<string> {
    const portfolio = await this.findAll(userId);
    if (portfolio.length === 0) {
        return "You have no positions to analyze. clearAdd some stocks to your portfolio first.";
    }

    // Construct Prompt
    const portfolioSummary = portfolio.map(p => 
        `- ${p.symbol}: ${p.shares} shares @ $${p.buy_price} (Current: $${p.current_price.toFixed(2)}). G/L: ${p.gain_loss_percent.toFixed(2)}%`
    ).join('\n');

    const prompt = `
    Analyze the following stock portfolio for a user with a "${riskAppetite}" risk appetite.
    
    Portfolio:
    ${portfolioSummary}

    Provide:
    1. Risk Assessment (Low/Medium/High) based on holdings.
    2. Suggest 1-2 positions to TRIM (if overexposed or risky) and why.
    3. Suggest general sectors to ADD for diversification.
    4. Keep it concise (max 200 words).
    `;

    return this.llmService.generateText(prompt);
  }
}
