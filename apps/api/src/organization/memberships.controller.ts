import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { JsonRequest } from '../auth/access.decorators.js';
import { Roles } from '../access/roles.decorator.js';
import { MembershipsService } from './memberships.service.js';

@Controller('organization')
@Roles('ADMIN')
@JsonRequest()
export class MembershipsController {
  constructor(@Inject(MembershipsService) private readonly memberships: MembershipsService) {}
  @Get('unit-memberships') listUnitMemberships(
    @Req() r: AuthenticatedRequest,
    @Query() q: unknown,
  ) {
    return this.memberships.listUnitMemberships(r.principal, q, r.requestId);
  }
  @Post('unit-memberships') grantUnit(@Req() r: AuthenticatedRequest, @Body() b: unknown) {
    return this.memberships.grantUnit(r.principal, b, r.requestId);
  }
  @Get('unit-memberships/:id')
  getUnitMembership(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.memberships.getUnitMembership(request.principal, id, request.requestId);
  }
  @Patch('unit-memberships/:id') updateUnitMembership(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.memberships.updateUnitMembership(r.principal, id, b, r.requestId);
  }
  @Delete('unit-memberships/:id') @HttpCode(204) async revokeUnit(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.memberships.updateUnitMembership(r.principal, id, { isActive: false }, r.requestId);
  }

  @Get('sector-memberships') listSectorMemberships(
    @Req() r: AuthenticatedRequest,
    @Query() q: unknown,
  ) {
    return this.memberships.listSectorMemberships(r.principal, q, r.requestId);
  }
  @Post('sector-memberships') grantSector(@Req() r: AuthenticatedRequest, @Body() b: unknown) {
    return this.memberships.grantSector(r.principal, b, r.requestId);
  }
  @Get('sector-memberships/:id')
  getSectorMembership(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.memberships.getSectorMembership(request.principal, id, request.requestId);
  }
  @Patch('sector-memberships/:id') updateSectorMembership(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.memberships.updateSectorMembership(r.principal, id, b, r.requestId);
  }
  @Delete('sector-memberships/:id') @HttpCode(204) async revokeSector(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.memberships.updateSectorMembership(
      r.principal,
      id,
      { isActive: false },
      r.requestId,
    );
  }
}
