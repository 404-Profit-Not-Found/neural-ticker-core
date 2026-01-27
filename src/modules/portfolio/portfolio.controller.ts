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
}
