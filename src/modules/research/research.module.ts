import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { ResearchNote } from './entities/research-note.entity';
import { LlmModule } from '../llm/llm.module';
import { SymbolsModule } from '../symbols/symbols.module';
import { MarketDataModule } from '../market-data/market-data.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResearchNote]),
    LlmModule,
    SymbolsModule,
    MarketDataModule,
  ],
  controllers: [ResearchController],
  providers: [ResearchService],
  exports: [ResearchService],
})
export class ResearchModule {}
