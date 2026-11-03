import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { JsonRequest, ManagementOnly } from '../auth/access.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AnalyticsService } from './analytics.service.js';
@Controller('analytics')
@ManagementOnly()
@JsonRequest()
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly service: AnalyticsService) {}
  @Get('qssma') qssma(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.qssma(r.principal, q, r.requestId);
  }
  @Get('filter-options') filterOptions(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.filterOptions(r.principal, q, r.requestId);
  }
  @Get('summary') summary(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.summary(r.principal, q, r.requestId);
  }
  @Get('trends') trends(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.trends(r.principal, q, r.requestId);
  }
  @Get('nonconformities') occurrences(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.occurrences(r.principal, q, r.requestId);
  }
  @Get('action-plans') plans(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.plans(r.principal, q, r.requestId);
  }
  @Get('forms') forms(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.forms(r.principal, q, r.requestId);
  }
}
