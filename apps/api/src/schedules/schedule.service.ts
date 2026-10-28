import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LockMode, type FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal } from '@portal/contracts';
import { nextOccurrence, occurrence } from '@portal/scheduling';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { escapeLike, parseId } from '../common/input.js';
import { User } from '../identity/user.entity.js';
import {
  InspectionSchedule,
  ScheduleResponsible,
  InspectionAssignment,
} from './schedule.entity.js';
import {
  parseCreateSchedule,
  parseSchedulePatch,
  parseScheduleQuery,
  parseCandidateQuery,
  parseAssignmentQuery,
} from './schedules.dto.js';
import { validateOperational } from './schedule-policy.js';
import {
  scheduleSummary,
  schedulePopulate,
  assignmentSummary,
  assignmentPopulate,
} from './schedule.mappers.js';
export class ScheduleService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
    private readonly now = () => new Date(),
  ) {}
  private async filter(
    actor: AuthenticatedPrincipal,
    requestId: string,
    em: EntityManager,
  ): Promise<FilterQuery<InspectionSchedule>> {
    await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
    return { sector: await this.access.sectorFilter(actor, requestId, em) };
  }
  async list(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const q = parseScheduleQuery(raw),
      em = this.entityManager.fork();
    const scope = await this.filter(actor, requestId, em);
    const [data, total] = await em.findAndCount(
      InspectionSchedule,
      {
        $and: [
          scope,
          {
            ...(q.q ? { name: { $ilike: `%${escapeLike(q.q)}%` } } : {}),
            ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
          },
        ],
      },
      {
        populate: [...schedulePopulate],
        limit: q.pageSize,
        offset: (q.page - 1) * q.pageSize,
        orderBy: { createdAt: 'desc', id: 'asc' },
      },
    );
    return { data: data.map(scheduleSummary), total, page: q.page, pageSize: q.pageSize };
  }
  async get(actor: AuthenticatedPrincipal, id: string, requestId: string) {
    const em = this.entityManager.fork();
    const scope = await this.filter(actor, requestId, em);
    const row = await em.findOne(
      InspectionSchedule,
      { $and: [{ id: parseId(id) }, scope] },
      { populate: [...schedulePopulate] },
    );
    if (!row) throw new ForbiddenException('Programação não permitida.');
    return scheduleSummary(row);
  }
  async candidates(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const q = parseCandidateQuery(raw),
      em = this.entityManager.fork();
    await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
    await this.access.assertUnitSector(actor, q.unitId, q.sectorId, requestId, em);
    const filter = `u.is_active=true and u.must_change_password=false and u.name ilike ? and (u.role='ADMIN' or exists (select 1 from sector_membership sm join unit_membership um on um.id=sm.unit_membership_id where sm.sector_id=? and sm.is_active=true and um.unit_id=? and um.is_active=true and um.user_id=u.id))`;
    const args = [`%${escapeLike(q.q ?? '')}%`, q.sectorId, q.unitId];
    const data = await em.execute<{ id: string; name: string }[]>(
      `select u.id,u.name from portal_user u where ${filter} order by u.name,u.id limit ? offset ?`,
      [...args, q.pageSize, (q.page - 1) * q.pageSize],
    );
    const totals = await em.execute<{ total: string }[]>(
      `select count(*) as total from portal_user u where ${filter}`,
      args,
    );
    return { data, total: Number(totals[0]!.total), page: q.page, pageSize: q.pageSize };
  }
  async create(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseCreateSchedule(raw);
    const now = this.now();
    let first: string;
    try {
      first = occurrence(input, input.startDate);
    } catch {
      throw new BadRequestException('Data ou horário inicial inválido.');
    }
    if (Date.parse(first) <= now.getTime())
      throw new BadRequestException('O primeiro horário precisa estar no futuro.');
    return this.entityManager.fork().transactional(async (em) => {
      await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
      const checked = await validateOperational(em, input, actor.userId);
      await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
      await this.access.assertUnitSector(actor, input.unitId, input.sectorId, requestId, em);
      const row = new InspectionSchedule();
      Object.assign(row, {
        name: input.name,
        frequency: input.frequency,
        startDate: input.startDate,
        time: input.time,
        endDate: input.endDate,
        deadlineHours: input.deadlineHours,
        unit: checked.unit,
        sector: checked.sector,
        form: checked.form,
        createdBy: em.getReference(User, actor.userId),
        nextOccurrenceAt: new Date(first),
      });
      em.persist(row);
      for (const user of checked.users) {
        const link = new ScheduleResponsible();
        link.schedule = row;
        link.user = user;
        em.persist(link);
      }
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'schedules.created',
          resource: 'schedule',
          resourceId: row.id,
          requestId,
          changes: { frequency: row.frequency },
        },
        em,
      );
      await em.populate(row, [...schedulePopulate]);
      return scheduleSummary(row);
    });
  }
  async update(actor: AuthenticatedPrincipal, id: string, raw: unknown, requestId: string) {
    const input = parseSchedulePatch(raw);
    return this.entityManager.fork().transactional(async (em) => {
      const row = await em.findOne(InspectionSchedule, parseId(id), {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!row) throw new ForbiddenException('Programação não permitida.');
      if (input.isActive !== true || row.isActive)
        await em.findOne(User, actor.userId, {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        });
      await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
      await this.access.assertUnitSector(actor, row.unit.id, row.sector.id, requestId, em);
      if (input.revision !== row.revision)
        throw new ConflictException('A programação mudou. Recarregue antes de continuar.');
      await em.populate(row, [...schedulePopulate]);
      if (input.name !== undefined) row.name = input.name;
      if (input.isActive !== undefined && input.isActive !== row.isActive) {
        if (input.isActive) {
          await validateOperational(
            em,
            {
              unitId: row.unit.id,
              sectorId: row.sector.id,
              formId: row.form.id,
              responsibleIds: row.responsibles.getItems().map((link) => link.user.id),
            },
            actor.userId,
          );
          await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
          await this.access.assertUnitSector(actor, row.unit.id, row.sector.id, requestId, em);
          const next = nextOccurrence(row, new Date(this.now().getTime() - 1).toISOString());
          if (!next) throw new BadRequestException('A vigência terminou. Crie outra programação.');
          row.nextOccurrenceAt = new Date(next);
          row.suspensionReason = null;
        } else {
          await em.nativeUpdate(
            InspectionAssignment,
            { schedule: row.id, status: 'PLANNED', occurrenceAt: { $gt: this.now() } },
            { status: 'CANCELLED', updatedAt: this.now() },
          );
        }
        row.isActive = input.isActive;
      }
      row.revision++;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'schedules.updated',
          resource: 'schedule',
          resourceId: row.id,
          requestId,
          changes: { isActive: row.isActive, revision: row.revision },
        },
        em,
      );
      return scheduleSummary(row);
    });
  }
  async assignments(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const q = parseAssignmentQuery(raw),
      em = this.entityManager.fork(),
      now = this.now();
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const scope = await this.access.sectorFilter(actor, requestId, em);
    const state: FilterQuery<InspectionAssignment> =
      q.state === 'CANCELLED'
        ? { status: 'CANCELLED' }
        : !q.state
          ? {}
          : {
              status: 'PLANNED',
              ...(q.state === 'UPCOMING'
                ? { occurrenceAt: { $gt: now } }
                : q.state === 'OVERDUE'
                  ? { dueAt: { $lt: now } }
                  : q.state === 'PENDING'
                    ? { occurrenceAt: { $lte: now }, dueAt: { $gte: now } }
                    : {}),
            };
    const [rows, total] = await em.findAndCount(
      InspectionAssignment,
      {
        $and: [
          { schedule: { sector: scope } },
          state,
          ...(user.role === 'COLLABORATOR' ? [{ responsibles: { $some: { user: user.id } } }] : []),
        ],
      },
      {
        populate: [...assignmentPopulate],
        limit: q.pageSize,
        offset: (q.page - 1) * q.pageSize,
        orderBy: { occurrenceAt: 'asc', id: 'asc' },
      },
    );
    return {
      data: rows.map((row) => assignmentSummary(row, now)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
