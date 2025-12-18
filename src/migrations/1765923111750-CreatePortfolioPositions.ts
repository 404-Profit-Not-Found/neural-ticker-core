import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreatePortfolioPositions1765923111750 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'portfolio_positions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'symbol',
            type: 'varchar',
          },
          {
            name: 'shares',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'buy_price',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'buy_date',
            type: 'date',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Foreign Key to Users table
    const table = await queryRunner.getTable('portfolio_positions');
    if (table) {
      const foreignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('user_id') !== -1,
      );
      if (!foreignKey) {
        await queryRunner.createForeignKey(
          'portfolio_positions',
          new TableForeignKey({
            columnNames: ['user_id'],
            referencedColumnNames: ['id'],
            referencedTableName: 'users',
            onDelete: 'CASCADE',
          }),
        );
      }
    }

    // Index on user_id + symbol
    // Check if index exists is trickier with QueryRunner, but safe to verify via pg_indexes or catch error
    // Simplest approach: use IF NOT EXISTS if supported or try/catch
    try {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_portfolio_user_symbol" ON "portfolio_positions" ("user_id", "symbol")`,
      );
    } catch {
      // Ignore if exists
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('portfolio_positions');
    if (!table) return;

    const foreignKey = table.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('user_id') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('portfolio_positions', foreignKey);
    }
    await queryRunner.dropTable('portfolio_positions');
  }
}
