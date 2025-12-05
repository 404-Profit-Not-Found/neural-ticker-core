import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SymbolsService } from './symbols.service';
import { SymbolsController } from './symbols.controller';
import { SymbolEntity } from './entities/symbol.entity';
import { FinnhubModule } from '../finnhub/finnhub.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SymbolEntity]),
    FinnhubModule,
  ],
  controllers: [SymbolsController],
  providers: [SymbolsService],
  exports: [SymbolsService],
})
export class SymbolsModule {}
