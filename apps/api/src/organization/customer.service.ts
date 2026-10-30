import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LockMode, type FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal, InspectionContext } from '@portal/contracts';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { User } from '../identity/user.entity.js';
import { Unit } from './unit.entity.js';
import { Customer, CustomerLocation, CustomerUnit } from './customer.entity.js';
import { escapeLike, parseId, withUniqueConflict } from '../common/input.js';
import {
  parseCustomerQuery,
  parseCustomerCreate,
  parseCustomerPatch,
  parseLocationCreate,
  parseLocationPatch,
} from './customer.dto.js';

export class CustomerService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
  ) {}
  private async administrator(actor: AuthenticatedPrincipal, em: EntityManager) {
    await em.findOne(User, actor.userId, { lockMode: LockMode.PESSIMISTIC_READ, refresh: true });
    await this.access.assertAdministrator(actor, em);
  }
  private async scope(actor: AuthenticatedPrincipal, em: EntityManager, requestId: string) {
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const filter = await this.access.unitFilter(actor, requestId, em);
    const units = await em.find(Unit, { $and: [filter, { isActive: true }] }, { fields: ['id'] });
    const allowed = new Set(units.map((u) => u.id));
    const customer: FilterQuery<Customer> =
      user.role === 'ADMIN'
        ? {}
        : { isActive: true, unitLinks: { $some: { isActive: true, unit: { $in: [...allowed] } } } };
    return { customer, allowed: user.role === 'ADMIN' ? undefined : allowed };
  }
  private view(row: Customer, allowed?: Set<string>) {
    const links = row.unitLinks
      .getItems()
      .filter((l) => l.isActive && (!allowed || allowed.has(l.unit.id)))
      .sort((a, b) => a.unit.id.localeCompare(b.unit.id));
    return {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      revision: row.revision,
      unitIds: links.map((l) => l.unit.id),
      units: links.map((l) => ({ id: l.unit.id, name: l.unit.name, isActive: l.unit.isActive })),
    };
  }
  private locationView(row: CustomerLocation) {
    return {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      revision: row.revision,
      customerId: row.customer.id,
      customerName: row.customer.name,
    };
  }
  async list(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const q = parseCustomerQuery(raw),
      em = this.entityManager.fork(),
      scope = await this.scope(actor, em, requestId);
    const where: FilterQuery<Customer> = {
      $and: [
        scope.customer,
        {
          ...(q.q ? { nameKey: { $ilike: `%${escapeLike(q.q.toLowerCase())}%` } } : {}),
          ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
          ...(q.unitId
            ? {
                unitLinks: {
                  $some: {
                    isActive: true,
                    unit: {
                      $and: [
                        { id: q.unitId, isActive: true },
                        scope.allowed ? { id: { $in: [...scope.allowed] } } : {},
                      ],
                    },
                  },
                },
              }
            : {}),
        },
      ],
    };
    const [rows, total] = await em.findAndCount(Customer, where, {
      populate: ['unitLinks.unit'],
      orderBy: { name: 'asc', id: 'asc' },
      limit: q.pageSize,
      offset: (q.page - 1) * q.pageSize,
    });
    return {
      data: rows.map((r) => this.view(r, scope.allowed)),
      configured:
        !!q.unitId &&
        (!scope.allowed || scope.allowed.has(q.unitId)) &&
        (await em.count(CustomerUnit, { unit: { id: q.unitId, isActive: true } })) > 0,
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async get(actor: AuthenticatedPrincipal, rawId: string, requestId: string) {
    const em = this.entityManager.fork(),
      scope = await this.scope(actor, em, requestId);
    const row = await em.findOne(
      Customer,
      { $and: [{ id: parseId(rawId) }, scope.customer] },
      { populate: ['unitLinks.unit'] },
    );
    if (!row) throw new ForbiddenException('Cliente não disponível.');
    return this.view(row, scope.allowed);
  }
  async save(actor: AuthenticatedPrincipal, raw: unknown, requestId: string, rawId?: string) {
    const id = rawId ? parseId(rawId) : undefined;
    const input = id ? parseCustomerPatch(raw) : parseCustomerCreate(raw);
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        await this.administrator(actor, em);
        const previous = id
          ? await em.find(CustomerUnit, { customer: id }, { fields: ['unit'] })
          : [];
        const unitIds = [
          ...new Set([...previous.map((l) => l.unit.id), ...(input.unitIds ?? [])]),
        ].sort();
        const units = await em.find(
          Unit,
          { id: { $in: unitIds } },
          { lockMode: LockMode.PESSIMISTIC_READ, orderBy: { id: 'asc' }, refresh: true },
        );
        if (
          input.unitIds &&
          input.unitIds.some((uid) => !units.some((u) => u.id === uid && u.isActive))
        )
          throw new BadRequestException('Selecione unidades ativas.');
        const row = id
          ? await em.findOne(Customer, id, {
              lockMode: LockMode.PESSIMISTIC_WRITE,
              populate: ['unitLinks.unit'],
              refresh: true,
            })
          : new Customer();
        if (!row) throw new ForbiddenException('Cliente não disponível.');
        if ('revision' in input && input.revision !== row.revision)
          throw new ConflictException('O cliente mudou. Recarregue antes de salvar.');
        if (input.name !== undefined) {
          row.name = input.name;
          row.nameKey = input.name.toLowerCase();
        }
        if ('isActive' in input && input.isActive !== undefined) row.isActive = input.isActive;
        em.persist(row);
        if (input.unitIds) {
          const existing = row.unitLinks.getItems();
          for (const link of existing) link.isActive = input.unitIds.includes(link.unit.id);
          for (const uid of input.unitIds)
            if (!existing.some((l) => l.unit.id === uid)) {
              const link = new CustomerUnit();
              Object.assign(link, { customer: row, unit: units.find((u) => u.id === uid)! });
              row.unitLinks.add(link);
              em.persist(link);
            }
        }
        if (id) row.revision++;
        await this.audit.record(
          {
            actorId: actor.userId,
            action: id ? 'customers.updated' : 'customers.created',
            resource: 'customer',
            resourceId: row.id,
            requestId,
          },
          em,
        );
        return this.view(row);
      }),
    );
  }
  async locations(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const q = parseCustomerQuery(raw),
      em = this.entityManager.fork(),
      scope = await this.scope(actor, em, requestId);
    if (q.unitId && scope.allowed && !scope.allowed.has(q.unitId))
      return { data: [], total: 0, page: q.page, pageSize: q.pageSize };
    const customer: FilterQuery<Customer> = {
      $and: [
        scope.customer,
        ...(q.customerId ? [{ id: q.customerId }] : []),
        ...(q.isActive === true ? [{ isActive: true }] : []),
        ...(q.unitId
          ? [{ unitLinks: { $some: { isActive: true, unit: { id: q.unitId, isActive: true } } } }]
          : []),
      ],
    };
    const [rows, total] = await em.findAndCount(
      CustomerLocation,
      {
        customer,
        ...(q.q ? { nameKey: { $ilike: `%${escapeLike(q.q.toLowerCase())}%` } } : {}),
        ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
      },
      {
        populate: ['customer'],
        orderBy: { name: 'asc', id: 'asc' },
        limit: q.pageSize,
        offset: (q.page - 1) * q.pageSize,
      },
    );
    return {
      data: rows.map((r) => this.locationView(r)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async getLocation(actor: AuthenticatedPrincipal, rawId: string, requestId: string) {
    const em = this.entityManager.fork(),
      scope = await this.scope(actor, em, requestId);
    const row = await em.findOne(
      CustomerLocation,
      { id: parseId(rawId), customer: scope.customer },
      { populate: ['customer'] },
    );
    if (!row) throw new ForbiddenException('Local não disponível.');
    return this.locationView(row);
  }
  async saveLocation(
    actor: AuthenticatedPrincipal,
    raw: unknown,
    requestId: string,
    rawId?: string,
  ) {
    const id = rawId ? parseId(rawId) : undefined,
      input = id ? parseLocationPatch(raw) : parseLocationCreate(raw);
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        await this.administrator(actor, em);
        const previous = id ? await em.findOne(CustomerLocation, id) : undefined;
        const customerId = 'customerId' in input ? input.customerId : previous?.customer.id;
        if (!customerId) throw new ForbiddenException('Local não disponível.');
        const customer = await em.findOne(Customer, customerId, {
          lockMode: LockMode.PESSIMISTIC_READ,
          refresh: true,
        });
        if (!customer || (!id && !customer.isActive))
          throw new BadRequestException('Selecione um cliente ativo.');
        const row = id
          ? await em.findOne(CustomerLocation, id, {
              lockMode: LockMode.PESSIMISTIC_WRITE,
              refresh: true,
            })
          : new CustomerLocation();
        if (!row) throw new ForbiddenException('Local não disponível.');
        if ('revision' in input && input.revision !== row.revision)
          throw new ConflictException('O local mudou. Recarregue antes de salvar.');
        row.customer = customer;
        if (input.name !== undefined) {
          row.name = input.name;
          row.nameKey = input.name.toLowerCase();
        }
        if ('isActive' in input && input.isActive !== undefined) row.isActive = input.isActive;
        if (id) row.revision++;
        em.persist(row);
        await this.audit.record(
          {
            actorId: actor.userId,
            action: id ? 'locations.updated' : 'locations.created',
            resource: 'location',
            resourceId: row.id,
            requestId,
          },
          em,
        );
        return this.locationView(row);
      }),
    );
  }
  /** Called after unit/sector locks, inside the inspection or scheduling transaction. */
  async requiresContext(em: EntityManager, unitId: string, typed = false) {
    return (
      typed ||
      (await em.count(CustomerUnit, {
        unit: unitId,
      })) > 0
    );
  }
  async context(
    em: EntityManager,
    unitId: string,
    customerId: string,
    locationId: string,
    participants: string[],
  ): Promise<InspectionContext> {
    const customer = await em.findOne(
      Customer,
      { id: customerId, isActive: true },
      { lockMode: LockMode.PESSIMISTIC_READ, refresh: true },
    );
    const link = customer
      ? await em.findOne(CustomerUnit, { customer: customer.id, unit: unitId, isActive: true })
      : undefined;
    if (!customer || !link)
      throw new ForbiddenException('Cliente não disponível para esta unidade.');
    const location = await em.findOne(
      CustomerLocation,
      { id: locationId, customer: customer.id, isActive: true },
      { lockMode: LockMode.PESSIMISTIC_READ, refresh: true },
    );
    if (!location) throw new ForbiddenException('Local não pertence ao cliente ou está inativo.');
    return {
      customerId: customer.id,
      customerName: customer.name,
      locationId: location.id,
      locationName: location.name,
      participants,
    };
  }
}
