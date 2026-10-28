import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LockMode, type FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal } from '@portal/contracts';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { escapeLike, parseId, withUniqueConflict } from '../common/input.js';
import { Unit } from './unit.entity.js';
import { Sector } from './sector.entity.js';
import {
  parseNamedCreate,
  parseNamedPatch,
  parseSectorCreate,
  parseUnitQuery,
  parseSectorQuery,
} from './organization.dto.js';
import { unitSummary, sectorSummary } from './organization.mappers.js';

export class OrganizationService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
  ) {}

  async listUnits(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const query = parseUnitQuery(raw),
      em = this.entityManager.fork();
    const scope = await this.access.unitFilter(actor, requestId, em);
    const filter: FilterQuery<Unit> = {
      ...(query.q ? { nameKey: { $ilike: `%${escapeLike(query.q.toLowerCase())}%` } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [units, total] = await em.findAndCount(
      Unit,
      { $and: [scope, filter] },
      {
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
        orderBy: { name: 'asc', id: 'asc' },
      },
    );
    return { data: units.map(unitSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async getUnit(actor: AuthenticatedPrincipal, rawId: string, requestId: string) {
    const id = parseId(rawId),
      em = this.entityManager.fork();
    const scope = await this.access.unitFilter(actor, requestId, em);
    const unit = await em.findOne(Unit, { $and: [{ id }, scope] });
    if (!unit) throw new ForbiddenException('Unidade não permitida.');
    return unitSummary(unit);
  }

  async createUnit(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseNamedCreate(raw);
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        await this.access.assertAdministrator(actor, em);
        const unit = new Unit();
        unit.name = input.name;
        unit.nameKey = input.name.toLowerCase();
        em.persist(unit);
        await this.audit.record(
          {
            actorId: actor.userId,
            action: 'organization.unit_created',
            resource: 'unit',
            resourceId: unit.id,
            requestId,
            changes: { ...unitSummary(unit) },
          },
          em,
        );
        return unitSummary(unit);
      }),
    );
  }

  async updateUnit(actor: AuthenticatedPrincipal, rawId: string, raw: unknown, requestId: string) {
    const id = parseId(rawId),
      input = parseNamedPatch(raw);
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        await this.access.assertAdministrator(actor, em);
        const unit = await em.findOne(Unit, id, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!unit) throw new NotFoundException('Unidade não encontrada.');
        const before = unitSummary(unit);
        if (input.name !== undefined) {
          unit.name = input.name;
          unit.nameKey = input.name.toLowerCase();
        }
        if (input.isActive !== undefined) unit.isActive = input.isActive;
        await this.audit.record(
          {
            actorId: actor.userId,
            action: 'organization.unit_updated',
            resource: 'unit',
            resourceId: id,
            requestId,
            changes: { before, after: unitSummary(unit) },
          },
          em,
        );
        return unitSummary(unit);
      }),
    );
  }

  async listSectors(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const query = parseSectorQuery(raw),
      em = this.entityManager.fork();
    const scope = await this.access.sectorFilter(actor, requestId, em);
    const filter: FilterQuery<Sector> = {
      ...(query.unitId ? { unit: query.unitId } : {}),
      ...(query.q ? { nameKey: { $ilike: `%${escapeLike(query.q.toLowerCase())}%` } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [sectors, total] = await em.findAndCount(
      Sector,
      { $and: [scope, filter] },
      {
        populate: ['unit'],
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
        orderBy: { name: 'asc', id: 'asc' },
      },
    );
    return { data: sectors.map(sectorSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async getSector(actor: AuthenticatedPrincipal, rawId: string, requestId: string) {
    const id = parseId(rawId),
      em = this.entityManager.fork();
    const scope = await this.access.sectorFilter(actor, requestId, em);
    const sector = await em.findOne(Sector, { $and: [{ id }, scope] }, { populate: ['unit'] });
    if (!sector) throw new ForbiddenException('Setor não permitido.');
    return sectorSummary(sector);
  }

  async createSector(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseSectorCreate(raw);
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        await this.access.assertAdministrator(actor, em);
        const unit = await em.findOne(
          Unit,
          { id: input.unitId, isActive: true },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!unit) throw new BadRequestException('Selecione uma unidade ativa.');
        const sector = new Sector();
        sector.unit = unit;
        sector.name = input.name;
        sector.nameKey = input.name.toLowerCase();
        em.persist(sector);
        await this.audit.record(
          {
            actorId: actor.userId,
            action: 'organization.sector_created',
            resource: 'sector',
            resourceId: sector.id,
            requestId,
            changes: { ...sectorSummary(sector) },
          },
          em,
        );
        return sectorSummary(sector);
      }),
    );
  }

  async updateSector(
    actor: AuthenticatedPrincipal,
    rawId: string,
    raw: unknown,
    requestId: string,
  ) {
    const id = parseId(rawId),
      input = parseNamedPatch(raw);
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        await this.access.assertAdministrator(actor, em);
        const sector = await em.findOne(Sector, id, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (!sector) throw new NotFoundException('Setor não encontrado.');
        await em.populate(sector, ['unit']);
        const before = sectorSummary(sector);
        if (input.name !== undefined) {
          sector.name = input.name;
          sector.nameKey = input.name.toLowerCase();
        }
        if (input.isActive !== undefined) sector.isActive = input.isActive;
        await this.audit.record(
          {
            actorId: actor.userId,
            action: 'organization.sector_updated',
            resource: 'sector',
            resourceId: id,
            requestId,
            changes: { before, after: sectorSummary(sector) },
          },
          em,
        );
        return sectorSummary(sector);
      }),
    );
  }
}
