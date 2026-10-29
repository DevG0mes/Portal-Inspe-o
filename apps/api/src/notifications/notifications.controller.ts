import { Controller, Get, Post, Query, Param, Req, Inject } from '@nestjs/common';
import { JsonRequest } from '../auth/access.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { NotificationService } from './notification.service.js';
@Controller('notifications')
@JsonRequest()
export class NotificationsController {
  constructor(@Inject(NotificationService) private readonly service: NotificationService) {}
  @Get() list(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.list(r.principal, q, r.requestId);
  }
  @Get('unread-count') count(@Req() r: AuthenticatedRequest) {
    return this.service.count(r.principal);
  }
  @Post('read-all') all(@Req() r: AuthenticatedRequest) {
    return this.service.read(r.principal);
  }
  @Post(':id/read') read(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.read(r.principal, id);
  }
}
