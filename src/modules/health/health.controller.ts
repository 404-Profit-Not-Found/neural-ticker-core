import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { Public } from '../auth/public.decorator';

@Public()
@ApiTags('Health')
@Controller('v1/health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({
    summary: 'Check system health',
    description:
      'Returns the status of the application and database connection.',
  })
  @ApiResponse({
    status: 200,
    description: 'System is healthy',
    schema: {
      example: {
        status: 'ok',
        db: 'up',
        env: 'local',
      },
    },
  })
  @Get()
  // eslint-disable-next-line @typescript-eslint/require-await
  async check() {
    const dbStatus = this.dataSource.isInitialized ? 'up' : 'down';
    return {
      status: 'ok',
      db: dbStatus,
      env: this.configService.get('env'),
    };
  }
}
