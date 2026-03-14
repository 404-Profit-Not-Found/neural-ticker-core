import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { PriceAlertsService } from './price-alerts.service';
import {
  CreatePriceAlertDto,
  UpdatePriceAlertDto,
} from './dto/create-price-alert.dto';

@ApiTags('Price Alerts')
@ApiBearerAuth()
@Controller('v1/price-alerts')
@UseGuards(AuthGuard('jwt'))
export class PriceAlertsController {
  constructor(private readonly priceAlertsService: PriceAlertsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new price alert' })
  @ApiResponse({ status: 201, description: 'Alert created' })
  async create(@Request() req: any, @Body() dto: CreatePriceAlertDto) {
    return this.priceAlertsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all price alerts for the current user' })
  @ApiResponse({ status: 200, description: 'List of alerts' })
  async findAll(@Request() req: any) {
    return this.priceAlertsService.findAllForUser(req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a price alert' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiResponse({ status: 200, description: 'Alert updated' })
  async update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdatePriceAlertDto,
  ) {
    return this.priceAlertsService.updateAlert(id, req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a price alert' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  @ApiResponse({ status: 200, description: 'Alert deleted' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.priceAlertsService.deleteAlert(id, req.user.id);
  }
}
