import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  HttpCode,
  Query,
} from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { CreatePortfolioPositionDto } from './dto/create-portfolio-position.dto';
import { UpdatePortfolioPositionDto } from './dto/update-portfolio-position.dto';
import { SellPositionDto } from './dto/sell-position.dto';
import { BuyAtMarketDto } from './dto/buy-at-market.dto';
import { CashOperationDto } from './dto/cash-operation.dto';
import { RecordTradeDto } from './dto/record-trade.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreditGuard } from '../research/guards/credit.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post('positions')
  @ApiOperation({ summary: 'Add a new position' })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePortfolioPositionDto,
  ) {
    return this.portfolioService.create(req.user.id, dto);
  }

  @Get('positions')
  @ApiOperation({ summary: 'Get portfolio positions with real-time data' })
  @ApiQuery({ name: 'displayCurrency', required: false, example: 'EUR' })
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('displayCurrency') displayCurrency?: string,
  ) {
    return this.portfolioService.findAll(req.user.id, displayCurrency);
  }

  @Patch('positions/:id')
  @ApiOperation({ summary: 'Update a position' })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePortfolioPositionDto,
  ) {
    return this.portfolioService.update(req.user.id, id, dto);
  }

  @Delete('positions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a position' })
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.portfolioService.remove(req.user.id, id);
  }

  @Post('positions/:id/sell')
  @ApiOperation({
    summary:
      'Sell shares of a position (market-hours gated: executes when open, ' +
      'else queued as a pending order)',
  })
  sell(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SellPositionDto,
  ) {
    return this.portfolioService.sell(req.user.id, id, dto);
  }

  @Post('positions/:id/buy')
  @ApiOperation({
    summary:
      'Buy more shares of a position at the live market price (market-hours ' +
      'gated: executes when open, else queued as a pending order)',
  })
  buy(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: BuyAtMarketDto,
  ) {
    return this.portfolioService.buy(req.user.id, id, dto);
  }

  @Get('pending-orders')
  @ApiOperation({
    summary: 'List pending (and recent terminal) market orders',
  })
  getPendingOrders(@Req() req: AuthenticatedRequest) {
    return this.portfolioService.getPendingOrders(req.user.id);
  }

  @Delete('pending-orders/:id')
  @ApiOperation({ summary: 'Cancel a pending market order' })
  cancelPendingOrder(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.portfolioService.cancelPendingOrder(req.user.id, id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Net-worth summary: holdings + cash' })
  @ApiQuery({ name: 'displayCurrency', required: false, example: 'EUR' })
  getSummary(
    @Req() req: AuthenticatedRequest,
    @Query('displayCurrency') displayCurrency?: string,
  ) {
    return this.portfolioService.getPortfolioSummary(
      req.user.id,
      displayCurrency,
    );
  }

  @Get('cash')
  @ApiOperation({ summary: 'Get simulator cash balances per currency' })
  getCash(@Req() req: AuthenticatedRequest) {
    return this.portfolioService.getCashBalances(req.user.id);
  }

  @Post('cash/deposit')
  @ApiOperation({ summary: 'Deposit simulator cash' })
  depositCash(@Req() req: AuthenticatedRequest, @Body() dto: CashOperationDto) {
    return this.portfolioService.depositCash(req.user.id, dto);
  }

  @Post('cash/withdraw')
  @ApiOperation({ summary: 'Withdraw simulator cash' })
  withdrawCash(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CashOperationDto,
  ) {
    return this.portfolioService.withdrawCash(req.user.id, dto);
  }

  @Get('trades')
  @ApiOperation({ summary: 'Trade history (most recent first)' })
  @ApiQuery({ name: 'symbol', required: false, example: 'AAPL' })
  @ApiQuery({ name: 'limit', required: false, example: 100 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  getTrades(
    @Req() req: AuthenticatedRequest,
    @Query('symbol') symbol?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.portfolioService.getTrades(req.user.id, {
      symbol,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post('trades')
  @ApiOperation({
    summary:
      'Record an externally-executed trade for consolidation (idempotent)',
  })
  recordTrade(@Req() req: AuthenticatedRequest, @Body() dto: RecordTradeDto) {
    return this.portfolioService.recordTrade(req.user.id, dto);
  }

  @UseGuards(CreditGuard)
  @Post('analyze')
  @ApiOperation({ summary: 'Generate AI analysis for portfolio' })
  @ApiBody({
    schema: {
      example: {
        riskAppetite: 'medium',
        horizon: 'medium-term',
        goal: 'growth',
        model: 'gemini',
      },
    },
  })
  analyze(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      riskAppetite?: string;
      horizon?: string;
      goal?: string;
      model?: string;
    },
  ) {
    return this.portfolioService.analyzePortfolio(
      req.user.id,
      body.riskAppetite || 'medium',
      body.horizon || 'medium-term',
      body.goal || 'growth',
      body.model || 'gemini',
    );
  }

  @Get('analyses')
  @ApiOperation({ summary: 'Get historical portfolio analyses' })
  getAnalyses(@Req() req: AuthenticatedRequest) {
    return this.portfolioService.getAnalyses(req.user.id);
  }

  @Get('quick-recommendation')
  @ApiOperation({
    summary: 'Free Gemma-powered quick portfolio recommendation (no credits)',
  })
  getQuickRecommendation(@Req() req: AuthenticatedRequest) {
    return this.portfolioService.getQuickRecommendation(req.user.id);
  }
}
