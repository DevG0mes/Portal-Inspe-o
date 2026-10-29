import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { JsonRequest } from '../auth/access.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { FileService } from './file.service.js';
@Controller('files')
export class FilesController {
  constructor(@Inject(FileService) private readonly service: FileService) {}
  @Get('policy') policy() {
    return this.service.policy();
  }
  @Post('prepare') @JsonRequest() prepare(@Req() r: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.prepare(r.principal, body, r.requestId);
  }
  @Put(':id/content') upload(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    if (!r.is('application/octet-stream'))
      throw new UnsupportedMediaTypeException('Envie application/octet-stream.');
    return this.service.upload(r.principal, id, body, r.requestId);
  }
  @Post(':id/finalize') @JsonRequest() finalize(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.finalize(r.principal, id, body, r.requestId);
  }
  @Post(':id/detach') @JsonRequest() detach(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.detach(r.principal, id, body, r.requestId);
  }
  @Get(':id/download') download(@Req() r: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.download(r.principal, id, r.requestId);
  }
}
