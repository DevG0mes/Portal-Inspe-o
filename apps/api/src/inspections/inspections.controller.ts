import { Body, Controller, Get, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { JsonRequest } from '../auth/access.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { InspectionService } from './inspection.service.js';
@Controller('inspections')
@JsonRequest()
export class InspectionsController {
  constructor(@Inject(InspectionService) private readonly service: InspectionService) {}
  @Get(':id') get(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.get(r.principal, id, r.requestId);
  }
  @Post() create(@Req() r: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.create(r.principal, body, r.requestId);
  }
  @Put(':id/draft') save(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.save(r.principal, id, body, r.requestId);
  }
  @Post(':id/complete') complete(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.complete(r.principal, id, body, r.requestId);
  }
  @Post(':id/reopen') reopen(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.reopen(r.principal, id, body, r.requestId);
  }
}
