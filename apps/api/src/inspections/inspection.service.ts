import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal, InspectionView } from '@portal/contracts';
import { RuleEngine } from '@portal/form-engine';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { parseId } from '../common/input.js';
import { User } from '../identity/user.entity.js';
import { Unit } from '../organization/unit.entity.js';
import { Sector } from '../organization/sector.entity.js';
import { FormTemplate } from '../forms/entities/form-template.entity.js';
import { FormVersion } from '../forms/entities/form-version.entity.js';
import { InspectionAssignment, AssignmentResponsible } from '../schedules/schedule.entity.js';
import { Inspection, InspectionSubmission } from './inspection.entity.js';
import {
  parseCreateInspection,
  parseInspectionDraft,
  parseCompleteInspection,
  parseReopenInspection,
} from './inspections.dto.js';

/** Mutations lock the inspection before reading its revision, state or completion cycle. */
export class InspectionService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
  ) {}

  private async lockActor(actor: AuthenticatedPrincipal, em: EntityManager) {
    await em.findOne(User, actor.userId, { lockMode: LockMode.PESSIMISTIC_READ, refresh: true });
  }
  /** Match membership mutations: user → unit → sector; read permissions only after these locks. */
  private async lockScope(unitId: string, sectorId: string, em: EntityManager) {
    await em.findOne(Unit, unitId, { lockMode: LockMode.PESSIMISTIC_READ, refresh: true });
    await em.findOne(Sector, sectorId, { lockMode: LockMode.PESSIMISTIC_READ, refresh: true });
  }

  private async authorize(
    actor: AuthenticatedPrincipal,
    row: Inspection,
    em: EntityManager,
    requestId: string,
    write: boolean,
  ) {
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    await this.access.assertUnitSector(actor, row.unit.id, row.sector.id, requestId, em);
    const responsible =
      row.createdBy.id === user.id ||
      (row.assignment &&
        (await em.count(AssignmentResponsible, { assignment: row.assignment.id, user: user.id })) >
          0);
    if (!responsible && (write || user.role === 'COLLABORATOR'))
      throw new ForbiddenException('Inspeção não permitida.');
  }
  private async load(
    actor: AuthenticatedPrincipal,
    id: string,
    em: EntityManager,
    requestId: string,
    write: boolean,
    lock = false,
  ) {
    if (lock) await this.lockActor(actor, em);
    const row = await em.findOne(Inspection, { id: parseId(id) });
    if (!row) throw new ForbiddenException('Inspeção não permitida.');
    if (lock) {
      await this.lockScope(row.unit.id, row.sector.id, em);
      await em.refresh(row, { lockMode: LockMode.PESSIMISTIC_WRITE });
    }
    await this.authorize(actor, row, em, requestId, write);
    return row;
  }
  private async view(row: Inspection, em: EntityManager): Promise<InspectionView> {
    await em.populate(row, ['formVersion']);
    const history = await em.find(
      InspectionSubmission,
      { inspection: row.id },
      { orderBy: { cycle: 'asc' } },
    );
    return {
      id: row.id,
      unitId: row.unit.id,
      sectorId: row.sector.id,
      assignmentId: row.assignment?.id ?? null,
      createdById: row.createdBy.id,
      formVersionId: row.formVersion.id,
      formVersionNumber: row.formVersion.number,
      snapshot: row.formVersion.snapshot,
      state: row.state,
      revision: row.revision,
      cycle: row.cycle,
      answers: row.answers,
      submissions: history.map((s) => ({
        id: s.id,
        cycle: s.cycle,
        sourceRevision: s.sourceRevision,
        completedAt: s.completedAt.toISOString(),
        completedById: s.completedBy.id,
        answers: s.answers,
        nonconformities: s.nonconformities,
      })),
    };
  }
  async get(actor: AuthenticatedPrincipal, id: string, requestId: string) {
    const em = this.entityManager.fork();
    return this.view(await this.load(actor, id, em, requestId, false), em);
  }
  async create(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseCreateInspection(raw);
    return this.entityManager.fork().transactional(async (em) => {
      await this.lockActor(actor, em);
      const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
      const row = new Inspection();
      row.createdBy = user;
      if ('assignmentId' in input) {
        // Serializing on the assignment makes repeated start requests return the same inspection.
        const assignment = await em.findOne(
          InspectionAssignment,
          { id: input.assignmentId },
          { populate: ['schedule'] },
        );
        if (!assignment) throw new ForbiddenException('Atribuição não permitida.');
        row.assignment = assignment;
        row.unit = assignment.schedule.unit;
        row.sector = assignment.schedule.sector;
        await this.lockScope(row.unit.id, row.sector.id, em);
        await em.refresh(assignment, { lockMode: LockMode.PESSIMISTIC_WRITE });
        await this.access.assertUnitSector(actor, row.unit.id, row.sector.id, requestId, em);
        if (!(await em.count(AssignmentResponsible, { assignment: assignment.id, user: user.id })))
          throw new ForbiddenException('Atribuição não permitida.');
        const existing = await em.findOne(Inspection, { assignment: assignment.id });
        if (existing) return this.view(existing, em);
        if (assignment.status !== 'PLANNED' || assignment.occurrenceAt > new Date())
          throw new ConflictException('Atribuição cancelada ou ainda não disponível.');
        row.formVersion = assignment.formVersion;
      } else {
        await this.lockScope(input.unitId, input.sectorId, em);
        await this.access.assertUnitSector(actor, input.unitId, input.sectorId, requestId, em);
        const form = await em.findOne(
          FormTemplate,
          { id: input.formId, state: 'PUBLISHED' },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!form) throw new BadRequestException('Selecione um formulário publicado.');
        const version = await em.findOne(FormVersion, {
          template: form.id,
          number: form.latestVersion,
        });
        if (!version) throw new ConflictException('Versão publicada indisponível.');
        row.unit = em.getReference(Unit, input.unitId);
        row.sector = em.getReference(Sector, input.sectorId);
        row.formVersion = version;
      }
      em.persist(row);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'inspection.created',
          resource: 'inspection',
          resourceId: row.id,
          requestId,
        },
        em,
      );
      return this.view(row, em);
    });
  }
  async save(actor: AuthenticatedPrincipal, id: string, raw: unknown, requestId: string) {
    const input = parseInspectionDraft(raw);
    return this.entityManager.fork().transactional(async (em) => {
      const row = await this.load(actor, id, em, requestId, true, true);
      if (row.state !== 'DRAFT' || row.revision !== input.revision)
        throw new ConflictException('Inspeção alterada. Recarregue preservando suas respostas.');
      await em.populate(row, ['formVersion']);
      const ids = new Set(
        row.formVersion.snapshot.sections.flatMap((s) => s.questions.map((q) => q.id)),
      );
      if (input.answers.some((a) => !ids.has(a.questionId)))
        throw new BadRequestException('Pergunta não pertence à versão desta inspeção.');
      row.answers = input.answers;
      row.revision++;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'inspection.draft_saved',
          resource: 'inspection',
          resourceId: row.id,
          requestId,
          changes: { revision: row.revision },
        },
        em,
      );
      return this.view(row, em);
    });
  }
  async complete(actor: AuthenticatedPrincipal, id: string, raw: unknown, requestId: string) {
    const input = parseCompleteInspection(raw);
    return this.entityManager.fork().transactional(async (em) => {
      const row = await this.load(actor, id, em, requestId, true, true);
      if (row.cycle !== input.cycle) throw new ConflictException('Ciclo de inspeção alterado.');
      if (row.state === 'COMPLETED') {
        const prior = await em.findOne(InspectionSubmission, {
          inspection: row.id,
          cycle: row.cycle,
        });
        if (prior?.sourceRevision === input.revision) return this.view(row, em);
        throw new ConflictException('Inspeção já concluída.');
      }
      if (row.revision !== input.revision)
        throw new ConflictException('Respostas alteradas. Salve e revise antes de concluir.');
      await em.populate(row, ['formVersion']);
      const result = new RuleEngine().evaluate(row.formVersion.snapshot, row.answers);
      if (result.definitionErrors.length || result.errors.length)
        throw new BadRequestException({
          message: 'Revise as respostas antes de concluir.',
          errors: result.errors,
        });
      const submission = new InspectionSubmission();
      Object.assign(submission, {
        inspection: row,
        cycle: row.cycle,
        sourceRevision: row.revision,
        completedBy: em.getReference(User, actor.userId),
        answers: result.acceptedAnswers,
        nonconformities: result.nonconformities,
      });
      em.persist(submission);
      row.answers = result.acceptedAnswers;
      row.state = 'COMPLETED';
      row.revision++;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'inspection.completed',
          resource: 'inspection',
          resourceId: row.id,
          requestId,
          changes: { cycle: row.cycle, submissionId: submission.id },
        },
        em,
      );
      return this.view(row, em);
    });
  }
  async reopen(actor: AuthenticatedPrincipal, id: string, raw: unknown, requestId: string) {
    const input = parseReopenInspection(raw);
    return this.entityManager.fork().transactional(async (em) => {
      const row = await this.load(actor, id, em, requestId, false, true);
      await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
      if (row.state !== 'COMPLETED' || row.revision !== input.revision)
        throw new ConflictException('Inspeção alterada ou não concluída.');
      row.state = 'DRAFT';
      row.cycle++;
      row.revision++;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'inspection.reopened',
          resource: 'inspection',
          resourceId: row.id,
          requestId,
          changes: { cycle: row.cycle, reason: input.reason },
        },
        em,
      );
      return this.view(row, em);
    });
  }
}
