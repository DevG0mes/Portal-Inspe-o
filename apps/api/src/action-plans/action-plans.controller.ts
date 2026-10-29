import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { JsonRequest } from '../auth/access.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ActionPlanService } from './action-plan.service.js';
@Controller('action-plans')
@JsonRequest()
export class ActionPlansController {
  constructor(@Inject(ActionPlanService) private readonly service: ActionPlanService) {}
  @Get() list(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.list(r.principal, q, r.requestId);
  }
  @Get('occurrences') occurrences(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.occurrences(r.principal, q, r.requestId);
  }
  @Get(':id') get(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.get(r.principal, id, r.requestId);
  }
  @Get(':id/history') history(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() q: unknown,
  ) {
    return this.service.history(r.principal, id, q, r.requestId);
  }
  @Post() create(@Req() r: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.create(r.principal, body, r.requestId);
  }
  @Post(':id/commands') command(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.command(r.principal, id, body, r.requestId);
  }
}
