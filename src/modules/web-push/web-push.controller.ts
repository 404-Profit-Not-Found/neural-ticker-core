import {
  Controller,
  Get,
  Post,
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
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { WebPushService } from './web-push.service';

@ApiTags('Web Push')
@Controller('v1/push')
export class WebPushController {
  constructor(private readonly webPushService: WebPushService) {}

  @Get('vapid-key')
  @Public()
  @ApiOperation({ summary: 'Get VAPID public key for push subscription' })
  @ApiResponse({ status: 200, description: 'VAPID public key' })
  getVapidKey() {
    return { key: this.webPushService.getPublicKey() };
  }

  @Post('subscribe')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a push subscription' })
  @ApiResponse({ status: 201, description: 'Subscription registered' })
  async subscribe(
    @Request() req: any,
    @Body()
    body: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
  ) {
    const userAgent = req.headers['user-agent'];
    return this.webPushService.subscribe(req.user.id, body, userAgent);
  }

  @Post('unsubscribe')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a push subscription' })
  @ApiResponse({ status: 200, description: 'Subscription removed' })
  async unsubscribe(@Request() req: any, @Body() body: { endpoint: string }) {
    await this.webPushService.unsubscribe(req.user.id, body.endpoint);
    return { success: true };
  }
}
