import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { JsonRequest } from '../auth/access.decorators.js';
import { Roles } from '../access/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { CustomerService } from './customer.service.js';
@Controller('organization')
@JsonRequest()
export class CustomerController {
  constructor(@Inject(CustomerService) private readonly service: CustomerService) {}
  @Get('customers') list(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.list(r.principal, q, r.requestId);
  }
  @Get('customers/:id') get(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.get(r.principal, id, r.requestId);
  }
  @Post('customers') @Roles('ADMIN') create(@Req() r: AuthenticatedRequest, @Body() b: unknown) {
    return this.service.save(r.principal, b, r.requestId);
  }
  @Patch('customers/:id') @Roles('ADMIN') update(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.save(r.principal, b, r.requestId, id);
  }
  @Get('locations') locations(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.service.locations(r.principal, q, r.requestId);
  }
  @Get('locations/:id') location(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getLocation(r.principal, id, r.requestId);
  }
  @Post('locations') @Roles('ADMIN') createLocation(
    @Req() r: AuthenticatedRequest,
    @Body() b: unknown,
  ) {
    return this.service.saveLocation(r.principal, b, r.requestId);
  }
  @Patch('locations/:id') @Roles('ADMIN') updateLocation(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.service.saveLocation(r.principal, b, r.requestId, id);
  }
}
