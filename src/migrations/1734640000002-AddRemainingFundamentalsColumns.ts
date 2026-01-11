import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRemainingFundamentalsColumns1734640000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      { name: 'market_cap', type: 'numeric(24,4)' },
      { name: 'pe_ttm', type: 'numeric(18,4)' },
      { name: 'trailing_pe', type: 'numeric(18,4)' },
      { name: 'forward_pe', type: 'numeric(18,4)' },
      { name: 'eps_ttm', type: 'numeric(18,4)' },
      { name: 'dividend_yield', type: 'numeric(10,4)' },
      { name: 'beta', type: 'numeric(10,4)' },
      { name: 'debt_to_equity', type: 'numeric(10,4)' },
      { name: 'revenue_ttm', type: 'numeric(24,4)' },
      { name: 'gross_margin', type: 'numeric(10,4)' },
      { name: 'net_profit_margin', type: 'numeric(10,4)' },
      { name: 'operating_margin', type: 'numeric(10,4)' },
      { name: 'roe', type: 'numeric(10,4)' },
      { name: 'roa', type: 'numeric(10,4)' },
      { name: 'price_to_book', type: 'numeric(10,4)' },
      { name: 'book_value_per_share', type: 'numeric(18,4)' },
      { name: 'free_cash_flow_ttm', type: 'numeric(24,4)' },
      { name: 'earnings_growth_yoy', type: 'numeric(10,4)' },
      { name: 'current_ratio', type: 'numeric(10,4)' },
      { name: 'quick_ratio', type: 'numeric(10,4)' },
      { name: 'interest_coverage', type: 'numeric(10,4)' },
      { name: 'debt_to_assets', type: 'numeric(10,4)' },
      { name: 'net_income_ttm', type: 'numeric(24,4)' },
      { name: 'total_debt', type: 'numeric(24,4)' },
      { name: 'total_assets', type: 'numeric(24,4)' },
      { name: 'total_liabilities', type: 'numeric(24,4)' },
      { name: 'total_cash', type: 'numeric(24,4)' },
      { name: 'sector', type: 'text' },
    ];

    for (const col of columns) {
      await queryRunner.query(
        `ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      'market_cap', 'pe_ttm', 'trailing_pe', 'forward_pe', 'eps_ttm',
      'dividend_yield', 'beta', 'debt_to_equity', 'revenue_ttm',
      'gross_margin', 'net_profit_margin', 'operating_margin', 'roe',
      'roa', 'price_to_book', 'book_value_per_share', 'free_cash_flow_ttm',
      'earnings_growth_yoy', 'current_ratio', 'quick_ratio',
      'interest_coverage', 'debt_to_assets', 'net_income_ttm',
      'total_debt', 'total_assets', 'total_liabilities', 'total_cash',
      'sector'
    ];

    for (const col of columns) {
      await queryRunner.query(
        `ALTER TABLE "fundamentals" DROP COLUMN IF EXISTS "${col}"`,
      );
    }
  }
}
