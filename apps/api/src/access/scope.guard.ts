import { Inject, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { parseId } from '../common/input.js';
import { AccessPolicy } from './access-policy.service.js';

export class ScopeGuard implements CanActivate {
  constructor(@Inject(AccessPolicy) private readonly access: AccessPolicy) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.access.assertUnitSector(
      request.principal,
      parseId(request.params.unitId),
      parseId(request.params.sectorId),
      request.requestId,
    );
    return true;
  }
}
