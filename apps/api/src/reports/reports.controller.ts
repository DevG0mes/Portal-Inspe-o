import { Controller, Get, Post, Body, Query, Param, Req, Inject } from '@nestjs/common';
import { JsonRequest } from '../auth/access.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ReportsService } from './reports.service.js';
@Controller('reports')
@JsonRequest()
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly service: ReportsService) {}
  @Post() create(@Req() r: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.create(r.principal, body, r.requestId);
  }
  @Get() list(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.list(r.principal, q);
  }
  @Get(':id') get(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.get(r.principal, id);
  }
  @Post(':id/retry') retry(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.retry(r.principal, id, r.requestId);
  }
  @Post(':id/download') download(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.download(r.principal, id, r.requestId);
  }
}
