import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../access/roles.decorator.js';
import { JsonRequest } from '../auth/access.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ScheduleService } from './schedule.service.js';
@Controller('schedules')
@JsonRequest()
export class SchedulesController {
  constructor(@Inject(ScheduleService) private readonly service: ScheduleService) {}
  @Get() @Roles('ADMIN', 'MANAGER') list(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.list(r.principal, q, r.requestId);
  }
  @Get('candidates') @Roles('ADMIN', 'MANAGER') candidates(
    @Req() r: AuthenticatedRequest,
    @Query() q: unknown,
  ) {
    return this.service.candidates(r.principal, q, r.requestId);
  }
  @Get('assignments') assignments(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.assignments(r.principal, q, r.requestId);
  }
  @Get(':id') @Roles('ADMIN', 'MANAGER') get(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.get(r.principal, id, r.requestId);
  }
  @Post() @Roles('ADMIN', 'MANAGER') create(@Req() r: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.create(r.principal, body, r.requestId);
  }
  @Patch(':id') @Roles('ADMIN', 'MANAGER') update(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(r.principal, id, body, r.requestId);
  }
}
