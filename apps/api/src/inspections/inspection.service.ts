import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LockMode, type FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal, InspectionView } from '@portal/contracts';
import { RuleEngine } from '@portal/form-engine';
import { CustomerService } from '../organization/customer.service.js';
import { assertFormAvailable } from '../forms/form-availability.js';
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
import { EvidenceArtifact, evidenceView } from '../files/file.entity.js';
import {
  parseCreateInspection,
  parseInspectionDraft,
  parseCompleteInspection,
  parseReopenInspection,
  parseInspectionQuery,
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
  private async view(
    actor: AuthenticatedPrincipal,
    row: Inspection,
    em: EntityManager,
  ): Promise<InspectionView> {
    await em.populate(row, ['formVersion']);
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const canEdit =
      row.createdBy.id === user.id ||
      !!(
        row.assignment &&
        (await em.count(AssignmentResponsible, { assignment: row.assignment.id, user: user.id }))
      );
    const history = await em.find(
      InspectionSubmission,
      { inspection: row.id },
      { orderBy: { cycle: 'asc' } },
    );
    return {
      id: row.id,
      context: row.context,
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
      canEdit,
      canReopen: user.role === 'ADMIN' || user.role === 'MANAGER',
      answers: row.answers,
      notes: row.notes,
      evidence: (
        await em.find(
          EvidenceArtifact,
          {
            inspection: row.id,
            detachedAt: null,
            status: { $in: ['PENDING', 'UPLOADED', 'READY'] },
          },
          { orderBy: { createdAt: 'asc', id: 'asc' } },
        )
      ).map(evidenceView),
      submissions: history.map((s) => ({
        id: s.id,
        cycle: s.cycle,
        sourceRevision: s.sourceRevision,
        completedAt: s.completedAt.toISOString(),
        completedById: s.completedBy.id,
        answers: s.answers,
        nonconformities: s.nonconformities,
        notes: s.notes,
        evidence: s.evidence,
      })),
    };
  }
  async get(
    actor: AuthenticatedPrincipal,
    id: string,
    requestId: string,
    snapshotEm?: EntityManager,
  ) {
    const em = snapshotEm ?? this.entityManager.fork();
    return this.view(actor, await this.load(actor, id, em, requestId, false), em);
  }
  /** Shared authorization/lock order for evidence mutations; caller owns the transaction. */
  loadForEvidence(
    actor: AuthenticatedPrincipal,
    id: string,
    em: EntityManager,
    requestId: string,
    write: boolean,
  ) {
    return this.load(actor, id, em, requestId, write, write);
  }
  async list(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const query = parseInspectionQuery(raw),
      em = this.entityManager.fork();
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const scope = await this.access.sectorFilter(actor, requestId, em);
    const ownership: FilterQuery<Inspection> =
      user.role === 'COLLABORATOR'
        ? {
            $or: [
              { createdBy: user.id },
              { assignment: { responsibles: { $some: { user: user.id } } } },
            ],
          }
        : {};
    const [rows, total] = await em.findAndCount(
      Inspection,
      { $and: [{ sector: scope }, ownership, query.state ? { state: query.state } : {}] },
      {
        populate: ['unit', 'sector', 'createdBy', 'formVersion'],
        fields: [
          'id',
          'state',
          'updatedAt',
          'unit.name',
          'sector.name',
          'createdBy.name',
          'formVersion.number',
          'formVersion.snapshot',
        ],
        orderBy: { updatedAt: 'desc', id: 'asc' },
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      },
    );
    return {
      data: rows.map((row) => ({
        id: row.id,
        title: row.formVersion.snapshot.title,
        unitName: row.unit.name,
        sectorName: row.sector.name,
        createdByName: row.createdBy.name,
        formVersionNumber: row.formVersion.number,
        state: row.state,
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
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
        if (existing) return this.view(actor, existing, em);
        if (assignment.status !== 'PLANNED' || assignment.occurrenceAt > new Date())
          throw new ConflictException('Atribuição cancelada ou ainda não disponível.');
        row.formVersion = assignment.formVersion;
        if (assignment.context) {
          const c = assignment.context;
          await new CustomerService(em, this.access, this.audit).context(
            em,
            row.unit.id,
            c.customerId,
            c.locationId,
            c.participants,
          );
          row.context = structuredClone(c);
        }
      } else {
        await this.lockScope(input.unitId, input.sectorId, em);
        await this.access.assertUnitSector(actor, input.unitId, input.sectorId, requestId, em);
        const form = await em.findOne(
          FormTemplate,
          { id: input.formId, state: 'PUBLISHED' },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!form) throw new BadRequestException('Selecione um formulário publicado.');
        await assertFormAvailable(em, form, input.unitId);
        const version = await em.findOne(FormVersion, {
          template: form.id,
          number: form.latestVersion,
        });
        if (!version) throw new ConflictException('Versão publicada indisponível.');
        row.unit = em.getReference(Unit, input.unitId);
        row.sector = em.getReference(Sector, input.sectorId);
        row.formVersion = version;
        const customers = new CustomerService(em, this.access, this.audit);
        if (
          !input.context &&
          (await customers.requiresContext(em, input.unitId, !!form.inspectionKind))
        )
          throw new BadRequestException('Selecione cliente e local antes de iniciar a inspeção.');
        if (input.context) {
          const c = input.context;
          row.context = await customers.context(
            em,
            input.unitId,
            c.customerId,
            c.locationId,
            c.participants,
          );
        }
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
      return this.view(actor, row, em);
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
      if (input.notes?.some((note) => !ids.has(note.questionId)))
        throw new BadRequestException('Observação não pertence à versão desta inspeção.');
      if (input.notes)
        row.notes = input.notes
          .filter((note) => note.text.trim())
          .map((note) => ({ ...note, text: note.text.trim() }));
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
      return this.view(actor, row, em);
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
        if (prior?.sourceRevision === input.revision) return this.view(actor, row, em);
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
      const visible = new Set(result.visibleQuestionIds);
      const artifacts = await em.find(EvidenceArtifact, {
        inspection: row.id,
        detachedAt: null,
        status: { $in: ['PENDING', 'UPLOADED', 'READY'] },
      });
      if (
        artifacts.some(
          (file) =>
            visible.has(file.questionId) && file.status !== 'READY' && file.expiresAt > new Date(),
        )
      )
        throw new ConflictException('Finalize ou cancele os envios pendentes antes de concluir.');
      Object.assign(submission, {
        inspection: row,
        cycle: row.cycle,
        sourceRevision: row.revision,
        completedBy: em.getReference(User, actor.userId),
        answers: result.acceptedAnswers,
        nonconformities: result.nonconformities,
        notes: row.notes.filter((note) => visible.has(note.questionId)),
        evidence: artifacts
          .filter((file) => visible.has(file.questionId) && file.status === 'READY')
          .map(evidenceView),
      });
      em.persist(submission);
      row.answers = result.acceptedAnswers;
      row.notes = submission.notes;
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
      return this.view(actor, row, em);
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
      return this.view(actor, row, em);
    });
  }
}
