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
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { JsonRequest } from '../auth/access.decorators.js';
import { Roles } from '../access/roles.decorator.js';
import { ScopeGuard } from '../access/scope.guard.js';
import { OrganizationService } from './organization.service.js';

@Controller('organization')
@JsonRequest()
export class OrganizationController {
  constructor(@Inject(OrganizationService) private readonly organization: OrganizationService) {}

  @Get('units') listUnits(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.organization.listUnits(r.principal, q, r.requestId);
  }
  @Get('units/:id') getUnit(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.organization.getUnit(r.principal, id, r.requestId);
  }
  @Post('units') @Roles('ADMIN') createUnit(@Req() r: AuthenticatedRequest, @Body() b: unknown) {
    return this.organization.createUnit(r.principal, b, r.requestId);
  }
  @Patch('units/:id') @Roles('ADMIN') updateUnit(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.organization.updateUnit(r.principal, id, b, r.requestId);
  }
  @Delete('units/:id') @Roles('ADMIN') @HttpCode(204) async deactivateUnit(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.organization.updateUnit(r.principal, id, { isActive: false }, r.requestId);
  }

  @Get('sectors') listSectors(@Req() r: AuthenticatedRequest, @Query() q: unknown) {
    return this.organization.listSectors(r.principal, q, r.requestId);
  }
  @Get('sectors/:id') getSector(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.organization.getSector(r.principal, id, r.requestId);
  }
  @Get('units/:unitId/sectors/:sectorId') @UseGuards(ScopeGuard) getScopedSector(
    @Req() r: AuthenticatedRequest,
    @Param('sectorId') id: string,
  ) {
    return this.organization.getSector(r.principal, id, r.requestId);
  }
  @Post('sectors') @Roles('ADMIN') createSector(
    @Req() r: AuthenticatedRequest,
    @Body() b: unknown,
  ) {
    return this.organization.createSector(r.principal, b, r.requestId);
  }
  @Patch('sectors/:id') @Roles('ADMIN') updateSector(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    return this.organization.updateSector(r.principal, id, b, r.requestId);
  }
  @Delete('sectors/:id') @Roles('ADMIN') @HttpCode(204) async deactivateSector(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.organization.updateSector(r.principal, id, { isActive: false }, r.requestId);
  }
}
