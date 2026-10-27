import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import type { FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal, UserRole } from '@portal/contracts';
import { User } from '../identity/user.entity.js';
import { Unit } from '../organization/unit.entity.js';
import { Sector } from '../organization/sector.entity.js';
import { SectorMembership } from '../organization/membership.entity.js';
import { AuditService } from '../audit/audit.service.js';

/** Reusable backend authorization. Unit access never implies access to all its sectors. */
export class AccessPolicy {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly audit: AuditService,
  ) {}

  async requireRoles(
    actor: AuthenticatedPrincipal,
    roles: readonly UserRole[],
    em = this.entityManager.fork(),
  ) {
    const user = await em.findOne(User, {
      id: actor.userId,
      isActive: true,
      mustChangePassword: false,
    });
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Acesso não permitido.');
    return user;
  }

  assertAdministrator(actor: AuthenticatedPrincipal, em = this.entityManager.fork()) {
    return this.requireRoles(actor, ['ADMIN'], em);
  }

  async unitFilter(
    actor: AuthenticatedPrincipal,
    requestId: string,
    em = this.entityManager.fork(),
  ): Promise<FilterQuery<Unit>> {
    const user = await this.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    if (user.role === 'ADMIN') {
      await this.audit.record(
        {
          actorId: user.id,
          action: 'access.global_read',
          resource: 'organization.unit',
          resourceId: 'list',
          requestId,
        },
        em,
      );
      return {};
    }
    return {
      isActive: true,
      memberships: {
        $some: { isActive: true, user: { id: user.id, isActive: true, mustChangePassword: false } },
      },
    };
  }

  async sectorFilter(
    actor: AuthenticatedPrincipal,
    requestId: string,
    em = this.entityManager.fork(),
  ): Promise<FilterQuery<Sector>> {
    const user = await this.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    if (user.role === 'ADMIN') {
      await this.audit.record(
        {
          actorId: user.id,
          action: 'access.global_read',
          resource: 'organization.sector',
          resourceId: 'list',
          requestId,
        },
        em,
      );
      return {};
    }
    // Applied to SQL before rows, totals and pagination are computed.
    return {
      isActive: true,
      unit: { isActive: true },
      memberships: {
        $some: {
          isActive: true,
          unitMembership: {
            isActive: true,
            unit: { isActive: true },
            user: { id: user.id, isActive: true, mustChangePassword: false },
          },
        },
      },
    };
  }

  async assertUnitSector(
    actor: AuthenticatedPrincipal,
    unitId: string,
    sectorId: string,
    requestId: string = randomUUID(),
    em = this.entityManager.fork(),
  ): Promise<void> {
    const user = await this.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const sector = await em.findOne(Sector, {
      id: sectorId,
      isActive: true,
      unit: { id: unitId, isActive: true },
    });
    if (!sector) throw new ForbiddenException('Unidade ou setor não permitido.');
    if (user.role === 'ADMIN') {
      await this.audit.record(
        {
          actorId: user.id,
          action: 'access.global_scope',
          resource: 'organization.sector',
          resourceId: sectorId,
          requestId,
          changes: { unitId },
        },
        em,
      );
      return;
    }
    const granted = await em.count(SectorMembership, {
      sector: sector.id,
      isActive: true,
      unitMembership: { user: user.id, unit: unitId, isActive: true },
    });
    if (granted === 0) throw new ForbiddenException('Unidade ou setor não permitido.');
  }
}
