import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, HttpCode } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { CreatePortfolioPositionDto } from './dto/create-portfolio-position.dto';
import { UpdatePortfolioPositionDto } from './dto/update-portfolio-position.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

@ApiTags('Portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post('positions')
  @ApiOperation({ summary: 'Add a new position' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePortfolioPositionDto) {
    return this.portfolioService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get portfolio positions with real-time data' })
  findAll(@Req() req: AuthenticatedRequest) {
    return this.portfolioService.findAll(req.user.id);
  }

  @Patch('positions/:id')
  @ApiOperation({ summary: 'Update a position' })
  update(
    @Req() req: AuthenticatedRequest, 
    @Param('id') id: string, 
    @Body() dto: UpdatePortfolioPositionDto
  ) {
    return this.portfolioService.update(req.user.id, id, dto);
  }

  @Delete('positions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a position' })
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.portfolioService.remove(req.user.id, id);
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Generate AI analysis for portfolio' })
  @ApiBody({ schema: { example: { riskAppetite: 'medium' } } })
  analyze(@Req() req: AuthenticatedRequest, @Body('riskAppetite') riskAppetite: string) {
    return this.portfolioService.analyzePortfolio(req.user.id, riskAppetite || 'medium');
  }
}
