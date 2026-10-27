import {
  ForbiddenException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest, AuthOptions } from './auth.types.js';
import { JSON_REQUEST, PASSWORD_CHANGE_ROUTE, PUBLIC_ROUTE } from './access.decorators.js';
import { readSessionCookie } from './session-cookie.js';

export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
    private readonly options: AuthOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const targets = [context.getHandler(), context.getClass()];
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      // SameSite is defense in depth; JSON and Origin checks also prevent login CSRF.
      if (
        (request.headers.origin && request.headers.origin !== this.options.origin) ||
        request.headers['sec-fetch-site'] === 'cross-site'
      ) {
        throw new ForbiddenException('Origem da requisição não permitida.');
      }
      if (
        this.reflector.getAllAndOverride<boolean>(JSON_REQUEST, targets) &&
        !request.is('application/json')
      ) {
        throw new UnsupportedMediaTypeException('Envie o conteúdo como application/json.');
      }
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) return true;
    const token = readSessionCookie(request.headers.cookie);
    if (!token) throw new UnauthorizedException('Credenciais inválidas.');
    request.principal = await this.auth.authenticate(token);
    if (
      request.principal.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(PASSWORD_CHANGE_ROUTE, targets)
    ) {
      throw new ForbiddenException('Troque sua senha antes de continuar.');
    }
    return true;
  }
}
