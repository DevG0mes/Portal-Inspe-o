import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LockMode, type FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal } from '@portal/contracts';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { User } from '../identity/user.entity.js';
import { parseId } from '../common/input.js';
import { Unit } from './unit.entity.js';
import { Sector } from './sector.entity.js';
import { UnitMembership, SectorMembership } from './membership.entity.js';
import {
  parseMembershipQuery,
  parseUnitGrant,
  parseSectorGrant,
  parseActivePatch,
} from './organization.dto.js';
import { unitMembershipSummary, sectorMembershipSummary } from './organization.mappers.js';

/** Explicit unit/sector grants, kept separate from organizational structure maintenance. */
export class MembershipsService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
  ) {}
  async listUnitMemberships(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const query = parseMembershipQuery(raw),
      em = this.entityManager.fork();
    await this.access.assertAdministrator(actor, em);
    const filter = {
      ...(query.userId ? { user: query.userId } : {}),
      ...(query.unitId ? { unit: query.unitId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [rows, total] = await em.findAndCount(UnitMembership, filter, {
      populate: ['unit'],
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      orderBy: { createdAt: 'asc', id: 'asc' },
    });
    await this.audit.record(
      {
        actorId: actor.userId,
        action: 'organization.memberships_read',
        resource: 'unit_membership',
        resourceId: 'list',
        requestId,
      },
      em,
    );
    return {
      data: rows.map(unitMembershipSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async listSectorMemberships(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const query = parseMembershipQuery(raw),
      em = this.entityManager.fork();
    await this.access.assertAdministrator(actor, em);
    const filter: FilterQuery<SectorMembership> = {
      unitMembership: {
        ...(query.userId ? { user: query.userId } : {}),
        ...(query.unitId ? { unit: query.unitId } : {}),
      },
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [rows, total] = await em.findAndCount(SectorMembership, filter, {
      populate: ['unitMembership.unit', 'sector'],
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      orderBy: { createdAt: 'asc', id: 'asc' },
    });
    await this.audit.record(
      {
        actorId: actor.userId,
        action: 'organization.memberships_read',
        resource: 'sector_membership',
        resourceId: 'list',
        requestId,
      },
      em,
    );
    return {
      data: rows.map(sectorMembershipSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getUnitMembership(actor: AuthenticatedPrincipal, rawId: string, requestId: string) {
    const id = parseId(rawId),
      em = this.entityManager.fork();
    await this.access.assertAdministrator(actor, em);
    const grant = await em.findOne(UnitMembership, id, { populate: ['unit'] });
    if (!grant) throw new NotFoundException('Vínculo não encontrado.');
    await this.audit.record(
      {
        actorId: actor.userId,
        action: 'organization.memberships_read',
        resource: 'unit_membership',
        resourceId: id,
        requestId,
      },
      em,
    );
    await em.populate(grant, ['unit']);
    return unitMembershipSummary(grant);
  }

  async getSectorMembership(actor: AuthenticatedPrincipal, rawId: string, requestId: string) {
    const id = parseId(rawId),
      em = this.entityManager.fork();
    await this.access.assertAdministrator(actor, em);
    const grant = await em.findOne(SectorMembership, id, {
      populate: ['unitMembership.unit', 'sector'],
    });
    if (!grant) throw new NotFoundException('Vínculo não encontrado.');
    await this.audit.record(
      {
        actorId: actor.userId,
        action: 'organization.memberships_read',
        resource: 'sector_membership',
        resourceId: id,
        requestId,
      },
      em,
    );
    await em.populate(grant, ['unitMembership.unit', 'sector']);
    return sectorMembershipSummary(grant);
  }

  async grantUnit(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseUnitGrant(raw);
    return this.entityManager.fork().transactional(async (em) => {
      await this.access.assertAdministrator(actor, em);
      const user = await em.findOne(
        User,
        { id: input.userId, isActive: true },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const unit = await em.findOne(
        Unit,
        { id: input.unitId, isActive: true },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!user || !unit) throw new BadRequestException('Selecione usuário e unidade ativos.');
      let grant = await em.findOne(UnitMembership, { user: user.id, unit: unit.id });
      if (!grant) {
        grant = new UnitMembership();
        grant.user = user;
        grant.unit = unit;
        em.persist(grant);
      }
      grant.isActive = true;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'organization.unit_membership_granted',
          resource: 'unit_membership',
          resourceId: grant.id,
          requestId,
          changes: { ...unitMembershipSummary(grant) },
        },
        em,
      );
      await em.populate(grant, ['unit']);
      return unitMembershipSummary(grant);
    });
  }

  async grantSector(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseSectorGrant(raw);
    return this.entityManager.fork().transactional(async (em) => {
      await this.access.assertAdministrator(actor, em);
      const user = await em.findOne(
        User,
        { id: input.userId, isActive: true },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const unit = await em.findOne(
        Unit,
        { id: input.unitId, isActive: true },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const sector = await em.findOne(
        Sector,
        { id: input.sectorId, unit: input.unitId, isActive: true },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const parent = await em.findOne(UnitMembership, {
        user: input.userId,
        unit: input.unitId,
        isActive: true,
      });
      if (!user || !unit || !sector || !parent)
        throw new BadRequestException(
          'Vínculo de unidade ativo e tipo de inspeção da mesma unidade são obrigatórios.',
        );
      let grant = await em.findOne(SectorMembership, {
        unitMembership: parent.id,
        sector: sector.id,
      });
      if (!grant) {
        grant = new SectorMembership();
        grant.unitMembership = parent;
        grant.sector = sector;
        em.persist(grant);
      }
      grant.isActive = true;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'organization.sector_membership_granted',
          resource: 'sector_membership',
          resourceId: grant.id,
          requestId,
          changes: { ...sectorMembershipSummary(grant) },
        },
        em,
      );
      await em.populate(grant, ['unitMembership.unit', 'sector']);
      return sectorMembershipSummary(grant);
    });
  }

  async updateUnitMembership(
    actor: AuthenticatedPrincipal,
    rawId: string,
    raw: unknown,
    requestId: string,
  ) {
    const id = parseId(rawId),
      input = parseActivePatch(raw);
    return this.entityManager.fork().transactional(async (em) => {
      await this.access.assertAdministrator(actor, em);
      const grant = await em.findOne(UnitMembership, id);
      if (!grant) throw new NotFoundException('Vínculo não encontrado.');
      const user = await em.findOneOrFail(User, grant.user.id, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      const unit = await em.findOneOrFail(Unit, grant.unit.id, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      // The row was read before waiting for the user lock; refresh its ORM snapshot now.
      await em.refresh(grant);
      if (input.isActive && (!user.isActive || !unit.isActive))
        throw new BadRequestException('Usuário e unidade precisam estar ativos.');
      grant.isActive = input.isActive;
      if (!input.isActive)
        await em.nativeUpdate(
          SectorMembership,
          { unitMembership: id, isActive: true },
          { isActive: false, updatedAt: new Date() },
        );
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'organization.unit_membership_updated',
          resource: 'unit_membership',
          resourceId: id,
          requestId,
          changes: { isActive: input.isActive, sectorGrantsDisabled: !input.isActive },
        },
        em,
      );
      await em.populate(grant, ['unit']);
      return unitMembershipSummary(grant);
    });
  }

  async updateSectorMembership(
    actor: AuthenticatedPrincipal,
    rawId: string,
    raw: unknown,
    requestId: string,
  ) {
    const id = parseId(rawId),
      input = parseActivePatch(raw);
    return this.entityManager.fork().transactional(async (em) => {
      await this.access.assertAdministrator(actor, em);
      const grant = await em.findOne(SectorMembership, id, {
        populate: ['unitMembership.unit', 'sector'],
      });
      if (!grant) throw new NotFoundException('Vínculo não encontrado.');
      const user = await em.findOneOrFail(User, grant.unitMembership.user.id, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      const unit = await em.findOneOrFail(Unit, grant.unitMembership.unit.id, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      const sector = await em.findOneOrFail(Sector, grant.sector.id, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      await em.refresh(grant);
      await em.refresh(grant.unitMembership);
      if (
        input.isActive &&
        (!user.isActive || !unit.isActive || !sector.isActive || !grant.unitMembership.isActive)
      )
        throw new BadRequestException(
          'Usuário, unidade, tipo de inspeção e vínculo de unidade precisam estar ativos.',
        );
      grant.isActive = input.isActive;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'organization.sector_membership_updated',
          resource: 'sector_membership',
          resourceId: id,
          requestId,
          changes: { isActive: input.isActive },
        },
        em,
      );
      await em.populate(grant, ['unitMembership.unit', 'sector']);
      return sectorMembershipSummary(grant);
    });
  }
}
