import {
  applyDecorators,
  Inject,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@portal/contracts';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AccessPolicy } from './access-policy.service.js';

const ALLOWED_ROLES = 'portal.allowed-roles';

export class RolesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessPolicy) private readonly access: AccessPolicy,
  ) {}

  async canActivate(context: ExecutionContext) {
    const roles =
      this.reflector.getAllAndOverride<UserRole[]>(ALLOWED_ROLES, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    await this.access.requireRoles(
      context.switchToHttp().getRequest<AuthenticatedRequest>().principal,
      roles,
    );
    return true;
  }
}

/** SessionGuard runs globally before this controller/method role guard. */
export const Roles = (...roles: UserRole[]) =>
  applyDecorators(SetMetadata(ALLOWED_ROLES, roles), UseGuards(RolesGuard));
