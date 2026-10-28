import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { JsonRequest } from '../auth/access.decorators.js';
import { Roles } from '../access/roles.decorator.js';
import { FormTemplateService } from './form-template.service.js';
import { FormVersionService } from './form-version.service.js';

@Controller('forms')
@JsonRequest()
export class FormsController {
  constructor(
    @Inject(FormTemplateService) private readonly templates: FormTemplateService,
    @Inject(FormVersionService) private readonly versions: FormVersionService,
  ) {}

  @Get() list(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.templates.list(request.principal, query);
  }
  @Get(':id') get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.templates.get(request.principal, id);
  }
  @Post() @Roles('ADMIN') create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.templates.create(request.principal, body, request.requestId);
  }
  @Get(':id/draft') @Roles('ADMIN') draft(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.templates.getDraft(request.principal, id);
  }
  @Post(':id/draft') @Roles('ADMIN') @HttpCode(200) createDraft(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.templates.createDraft(request.principal, id, body, request.requestId);
  }
  @Put(':id/draft') @Roles('ADMIN') saveDraft(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.templates.saveDraft(request.principal, id, body, request.requestId);
  }
  @Post(':id/preview') @Roles('ADMIN') @HttpCode(200) preview(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.templates.preview(request.principal, id, body);
  }
  @Post(':id/publish') @Roles('ADMIN') @HttpCode(200) publish(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.versions.publish(request.principal, id, body, request.requestId);
  }
  @Post(':id/archive') @Roles('ADMIN') @HttpCode(200) archive(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.templates.archive(request.principal, id, body, request.requestId);
  }
  @Get(':id/versions') @Roles('ADMIN') history(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.versions.list(request.principal, id, query);
  }
  @Get(':id/versions/:number') version(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('number') number: string,
  ) {
    return this.versions.get(request.principal, id, number);
  }
}
