import { Module } from '@nestjs/common';
import { McpModule, McpTransportType } from '@rekog/mcp-nest';
import { Public } from '../auth/public.decorator';
import { MarketDataModule } from '../market-data/market-data.module';
import { TickersModule } from '../tickers/tickers.module';
import { TickerRequestsModule } from '../ticker-requests/ticker-requests.module';
import { RiskRewardModule } from '../risk-reward/risk-reward.module';
import { ResearchModule } from '../research/research.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { PriceAlertsModule } from '../price-alerts/price-alerts.module';
import { CurrencyModule } from '../currency/currency.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { McpSoftAuthGuard } from './auth/mcp-soft-auth.guard';
import { MarketDataTools } from './tools/market-data.tools';
import { RiskTools } from './tools/risk.tools';
import { ResearchTools } from './tools/research.tools';
import { PortfolioTools } from './tools/portfolio.tools';
import { TickerRequestsTools } from './tools/ticker-requests.tools';

/**
 * In-process Model Context Protocol (MCP) server.
 *
 * Mounts a single Streamable HTTP endpoint at `POST /api/mcp` (the app's
 * global prefix `api` + `mcpEndpoint: 'mcp'`) and exposes the platform's
 * services as MCP tools, reusing the existing service layer via DI.
 *
 * Auth model (soft-auth / bearer passthrough):
 *  - `decorators: [Public()]` stamps `IS_PUBLIC_KEY` on the mcp-nest
 *    controller class so the global `JwtAuthGuard` skips it (anonymous reach).
 *  - `guards: [McpSoftAuthGuard]` then validates a Bearer token if present and
 *    populates `request.user`, but never rejects. User-scoped tools enforce
 *    auth themselves via `requireUser(req)`; admin-only tools via
 *    `requireAdmin(req)`.
 *
 * Stateless mode is used so the endpoint works on Cloud Run (no session
 * affinity).
 */
@Module({
  imports: [
    McpModule.forRoot({
      name: 'neural-ticker',
      version: '0.6.0',
      transport: McpTransportType.STREAMABLE_HTTP,
      mcpEndpoint: 'mcp',
      guards: [McpSoftAuthGuard],
      decorators: [Public()],
      streamableHttp: {
        statelessMode: true,
        enableJsonResponse: true,
        sessionIdGenerator: undefined,
      },
    }),
    MarketDataModule,
    TickersModule,
    TickerRequestsModule,
    RiskRewardModule,
    ResearchModule,
    PortfolioModule,
    WatchlistModule,
    PriceAlertsModule,
    CurrencyModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    MarketDataTools,
    RiskTools,
    ResearchTools,
    PortfolioTools,
    TickerRequestsTools,
  ],
})
export class McpToolsModule {}
