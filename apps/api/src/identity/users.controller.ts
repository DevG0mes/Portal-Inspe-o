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
import { UsersService } from './users.service.js';

@Controller('users')
@Roles('ADMIN')
@JsonRequest()
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get() list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.users.list(request.principal, query, request.requestId);
  }
  @Get(':id') get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.users.get(request.principal, id, request.requestId);
  }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.users.create(request.principal, body, request.requestId);
  }
  @Patch(':id') update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.users.update(request.principal, id, body, request.requestId);
  }
  @Delete(':id') @HttpCode(204) async deactivate(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.users.update(request.principal, id, { isActive: false }, request.requestId);
  }
  @Post(':id/reset-password') @HttpCode(204) reset(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.users.resetPassword(request.principal, id, body, request.requestId);
  }
}
