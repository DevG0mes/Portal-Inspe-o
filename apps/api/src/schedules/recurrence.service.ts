import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CustomerService } from '../organization/customer.service.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { materializationKey, nextOccurrence } from '@portal/scheduling';
import { AuditService } from '../audit/audit.service.js';
import { FormVersion } from '../forms/entities/form-version.entity.js';
import {
  InspectionSchedule,
  InspectionAssignment,
  AssignmentResponsible,
} from './schedule.entity.js';
import { validateOperational } from './schedule-policy.js';
import { emitOnce } from '../notifications/notification-events.js';
export class RecurrenceService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly audit: AuditService,
    private readonly now = () => new Date(),
  ) {}
  async due() {
    return this.entityManager.fork().find(
      InspectionSchedule,
      {
        isActive: true,
        nextOccurrenceAt: { $lte: new Date(this.now().getTime() + 7 * 86400000) },
      },
      { limit: 100, orderBy: { nextOccurrenceAt: 'asc', id: 'asc' } },
    );
  }
  async materialize(
    scheduleId: string,
    occurrenceAt: string,
    idempotencyKey: string,
  ): Promise<InspectionAssignment> {
    if (
      !Number.isFinite(Date.parse(occurrenceAt)) ||
      idempotencyKey !== materializationKey(scheduleId, occurrenceAt)
    )
      throw new BadRequestException('Chave de ocorrência inválida.');
    const at = new Date(occurrenceAt),
      now = this.now();
    const result = await this.entityManager.fork().transactional(async (em) => {
      const schedule = await em.findOne(InspectionSchedule, scheduleId, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!schedule) throw new BadRequestException('Programação inexistente.');
      const previous = await em.findOne(InspectionAssignment, {
        schedule: scheduleId,
        occurrenceAt: at,
      });
      if (previous && (!schedule.isActive || schedule.nextOccurrenceAt?.getTime() !== at.getTime()))
        return previous;
      if (
        !schedule.isActive ||
        schedule.nextOccurrenceAt?.getTime() !== at.getTime() ||
        at.getTime() > now.getTime() + 7 * 86400000
      )
        throw new ConflictException('Ocorrência fora do cursor ou da janela de programação.');
      await em.populate(schedule, ['responsibles.user']);
      let checked;
      const context = schedule.context;
      try {
        checked = await validateOperational(em, {
          unitId: schedule.unit.id,
          sectorId: schedule.sector.id,
          formId: schedule.form.id,
          responsibleIds: schedule.responsibles.getItems().map((link) => link.user.id),
        });
        if (context)
          await new CustomerService(em, new AccessPolicy(em, this.audit), this.audit).context(
            em,
            schedule.unit.id,
            context.customerId,
            context.locationId,
            context.participants,
            context.locationKind ?? 'substation',
          );
      } catch (error) {
        if (!(error instanceof BadRequestException) && !(error instanceof ForbiddenException))
          throw error;
        schedule.isActive = false;
        schedule.suspensionReason = error.message;
        schedule.revision++;
        await this.audit.record(
          {
            action: 'schedules.suspended',
            resource: 'schedule',
            resourceId: schedule.id,
            requestId: randomUUID(),
            changes: { reason: schedule.suspensionReason },
          },
          em,
        );
        return null;
      }
      const version = await em.findOneOrFail(FormVersion, {
        template: checked.form.id,
        number: checked.form.latestVersion,
      });
      const assignment = previous ?? new InspectionAssignment();
      if (!previous) {
        assignment.context = context;
        assignment.schedule = schedule;
        assignment.formVersion = version;
        assignment.occurrenceAt = at;
        assignment.dueAt = new Date(at.getTime() + schedule.deadlineHours * 3600000);
        em.persist(assignment);
        for (const user of checked.users) {
          const link = new AssignmentResponsible();
          link.assignment = assignment;
          link.user = user;
          em.persist(link);
        }
      }
      assignment.status = 'PLANNED';
      const next = nextOccurrence(schedule, at.toISOString());
      schedule.nextOccurrenceAt = next ? new Date(next) : null;
      await em.flush();
      for (const user of checked.users)
        await emitOnce(em, `assignment-${assignment.id}`, user.id, {
          kind: 'ASSIGNMENT_ASSIGNED',
          resourceType: 'ASSIGNMENT',
          resourceId: assignment.id,
        });
      await this.audit.record(
        {
          action: previous ? 'schedules.occurrence_restored' : 'schedules.materialized',
          resource: 'assignment',
          resourceId: assignment.id,
          requestId: randomUUID(),
          changes: {
            scheduleId,
            occurrenceAt: at.toISOString(),
            versionId: assignment.formVersion.id,
          },
        },
        em,
      );
      return assignment;
    });
    if (!result)
      throw new ConflictException(
        'Programação suspensa. Revise formulário, escopo e responsáveis.',
      );
    return result;
  }
}
