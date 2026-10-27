import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { AllowPasswordChange, JsonRequest, Public } from './access.decorators.js';
import { parseLogin } from './dto/login.dto.js';
import { parseChangePassword } from './dto/change-password.dto.js';
import type { AuthenticatedRequest, AuthOptions } from './auth.types.js';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie.js';

export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');

@Controller('auth')
@JsonRequest()
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_OPTIONS) private readonly options: AuthOptions,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(
      parseLogin(body),
      request.requestId,
      readSessionCookie(request.headers.cookie),
    );
    setSessionCookie(response, result.token, this.options);
    return result.principal;
  }

  @AllowPasswordChange()
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return request.principal;
  }

  @AllowPasswordChange()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.principal, request.requestId);
    clearSessionCookie(response, this.options);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logoutAll(request.principal, request.requestId);
    clearSessionCookie(response, this.options);
  }

  @AllowPasswordChange()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.changePassword(
      request.principal,
      parseChangePassword(body),
      request.requestId,
    );
    setSessionCookie(response, result.token, this.options);
    return result.principal;
  }
}
