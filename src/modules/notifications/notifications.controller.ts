import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
  Patch,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('v1/notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Sse('stream')
  @ApiOperation({ summary: 'Stream notifications real-time' })
  startNotificationStream(@Request() req: any): Observable<MessageEvent> {
    return this.notificationsService.getEventStream(req.user.id).pipe(
      map((notification) => ({
        data: notification,
        type: 'notification',
      })),
    );
  }

  @ApiOperation({ summary: 'Get all notifications for current user' })
  @ApiResponse({ status: 200, description: 'List of notifications' })
  @Get()
  async getNotifications(@Request() req: any) {
    return this.notificationsService.findAllForUser(req.user.id);
  }

  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({ status: 200, description: 'Unread count object' })
  @Get('count')
  async getUnreadCount(@Request() req: any) {
    const count = await this.notificationsService.getUnreadCount(req.user.id);
    return { count };
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: 200, description: 'Success' })
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'Success' })
  @Patch('read-all')
  async markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }
}
