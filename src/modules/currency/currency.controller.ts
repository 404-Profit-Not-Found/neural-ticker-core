import {
  Controller,
  Get,
  Post,
  Query,
  Inject,
  forwardRef,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CurrencyService } from './currency.service';
import { TickersService } from '../tickers/tickers.service';
import { Public } from '../auth/public.decorator';

// Common currency flags for display
const CURRENCY_FLAGS: Record<string, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  CHF: '🇨🇭',
  JPY: '🇯🇵',
  CAD: '🇨🇦',
  AUD: '🇦🇺',
  DKK: '🇩🇰',
  HKD: '🇭🇰',
  SEK: '🇸🇪',
  NOK: '🇳🇴',
  CNY: '🇨🇳',
  SGD: '🇸🇬',
  KRW: '🇰🇷',
  INR: '🇮🇳',
  BRL: '🇧🇷',
  MXN: '🇲🇽',
  NZD: '🇳🇿',
  ZAR: '🇿🇦',
  PLN: '🇵🇱',
  TRY: '🇹🇷',
  RUB: '🇷🇺',
  ILS: '🇮🇱',
  TWD: '🇹🇼',
};

@ApiTags('Currency')
@Controller('v1/currency')
export class CurrencyController {
  constructor(
    private readonly currencyService: CurrencyService,
    @Inject(forwardRef(() => TickersService))
    private readonly tickersService: TickersService,
  ) {}

  @Get('available')
  @Public()
  @ApiOperation({ summary: 'Get currencies available in tracked tickers' })
  async getAvailableCurrencies() {
    const currencies = await this.tickersService.getUniqueCurrencies();

    // Always include USD as base, even if no USD stocks
    const uniqueCurrencies = [...new Set(['USD', ...currencies])].sort();

    return {
      currencies: uniqueCurrencies.map((code) => ({
        code,
        flag: CURRENCY_FLAGS[code] || '💱',
      })),
    };
  }

  @Post('backfill-tickers')
  @Public()
  @ApiOperation({
    summary: 'Backfill currency on existing tickers from Yahoo Finance',
  })
  async backfillTickerCurrencies() {
    const result = await this.tickersService.backfillTickerCurrencies();
    return result;
  }

  @Get('rates')
  @Public()
  @ApiOperation({ summary: 'Get latest exchange rates (base: USD)' })
  async getRates() {
    const data = await this.currencyService.getRates();
    return {
      base: data?.base ?? 'USD',
      rates: data?.rates ?? {},
      lastUpdated: data?.lastUpdated?.toISOString() ?? null,
      supported: this.currencyService.getSupportedCurrencies(),
    };
  }

  @Get('convert')
  @Public()
  @ApiOperation({ summary: 'Convert amount between currencies' })
  @ApiQuery({ name: 'amount', type: Number, required: true })
  @ApiQuery({ name: 'from', type: String, required: true, example: 'USD' })
  @ApiQuery({ name: 'to', type: String, required: true, example: 'EUR' })
  async convert(
    @Query('amount') amount: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
      throw new BadRequestException('Invalid amount');
    }

    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();

    const rate = await this.currencyService.getRate(fromCode, toCode);
    if (rate === null) {
      throw new ServiceUnavailableException(
        `Exchange rate for ${fromCode}/${toCode} unavailable`,
      );
    }

    return {
      from: fromCode,
      to: toCode,
      amount: amountNum,
      converted: amountNum * rate,
      rate,
    };
  }
}
