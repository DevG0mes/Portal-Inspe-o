import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { LockMode, type FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal, ActionPlanView, ActionPlanSummary } from '@portal/contracts';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { User } from '../identity/user.entity.js';
import { Sector } from '../organization/sector.entity.js';
import { SectorMembership } from '../organization/membership.entity.js';
import { InspectionSubmission } from '../inspections/inspection.entity.js';
import { EvidenceArtifact, evidenceView } from '../files/file.entity.js';
import { ActionPlan, ActionPlanEvent } from './action-plan.entity.js';
import { ActionPlanAccess } from './action-plan.access.js';
import { transition, isOverdue } from './action-plan.machine.js';
import { emitOnce, managers } from '../notifications/notification-events.js';
import {
  deadline,
  parseActionCreate,
  parseActionCommand,
  parseActionQuery,
  parseHistoryQuery,
} from './action-plans.dto.js';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class ActionPlanService {
  constructor(
    private readonly em: EntityManager,
    private readonly access: AccessPolicy,
    private readonly policy: ActionPlanAccess,
    private readonly audit: AuditService,
  ) {}
  private async assignee(em: EntityManager, id: string, unitId: string, sectorId: string) {
    const user = await em.findOne(User, { id, isActive: true, mustChangePassword: false });
    if (
      !user ||
      (user.role !== 'ADMIN' &&
        !(await em.count(SectorMembership, {
          sector: sectorId,
          isActive: true,
          unitMembership: { user: id, unit: unitId, isActive: true },
        })))
    )
      throw new BadRequestException('Responsável precisa estar ativo e ter acesso ao setor.');
    return user;
  }
  private summary(row: ActionPlan): ActionPlanSummary {
    return {
      id: row.id,
      description: row.description,
      category: row.category,
      priority: row.priority,
      state: row.state,
      revision: row.revision,
      responsibleId: row.responsible.id,
      responsibleName: row.responsible.name,
      unitId: row.unit.id,
      sectorId: row.sector.id,
      unitName: row.unit.name,
      sectorName: row.sector.name,
      dueDate: row.dueDate,
      dueAt: row.dueAt.toISOString(),
      overdue: isOverdue(row.state, row.dueAt.toISOString()),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }
  private async events(row: ActionPlan, em: EntityManager, page = 1, pageSize = 10) {
    const [events, total] = await em.findAndCount(
      ActionPlanEvent,
      { actionPlan: row.id },
      {
        populate: ['actor'],
        orderBy: { createdAt: 'desc', id: 'desc' },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      },
    );
    return {
      data: events.map((event) => ({
        id: event.id,
        type: event.type,
        actorName: event.actor.name,
        createdAt: event.createdAt.toISOString(),
        fromState: event.fromState,
        toState: event.toState,
        text: event.text,
        evidence: event.evidence,
        assignment: event.assignment,
      })),
      total,
      page,
      pageSize,
    };
  }
  private async view(
    actor: AuthenticatedPrincipal,
    row: ActionPlan,
    em: EntityManager,
  ): Promise<ActionPlanView> {
    await em.populate(row, ['unit', 'sector', 'responsible', 'submission.inspection.formVersion']);
    const source = row.submission,
      inspection = source.inspection;
    const question = inspection.formVersion.snapshot.sections
      .flatMap((section) => section.questions)
      .find((item) => item.id === row.questionId);
    if (!question) throw new ConflictException('Pergunta de origem indisponível.');
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    return {
      ...this.summary(row),
      sourceSubmissionId: source.id,
      questionId: row.questionId,
      question,
      sourceAnswer:
        source.answers.find((answer) => answer.questionId === row.questionId)?.value ?? null,
      sourceNote: source.notes.find((note) => note.questionId === row.questionId)?.text ?? null,
      sourceEvidence: source.evidence.filter((file) => file.questionId === row.questionId),
      inspectionTitle: inspection.formVersion.snapshot.title,
      canManage: user.role !== 'COLLABORATOR',
      canExecute: user.id === row.responsible.id,
      evidence: (
        await em.find(
          EvidenceArtifact,
          {
            actionPlan: row.id,
            detachedAt: null,
            status: { $in: ['PENDING', 'UPLOADED', 'READY'] },
          },
          { orderBy: { createdAt: 'asc', id: 'asc' } },
        )
      ).map(evidenceView),
      history: await this.events(row, em),
    };
  }
  async list(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const q = parseActionQuery(raw),
      em = this.em.fork(),
      user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const scope = await this.access.sectorFilter(actor, requestId, em);
    const filter: FilterQuery<ActionPlan> = {
      $and: [
        { sector: scope },
        ...(user.role === 'COLLABORATOR' ? [{ responsible: user.id }] : []),
        ...(q.state ? [{ state: q.state }] : []),
        ...(q.overdue === 'true'
          ? [{ state: { $ne: 'COMPLETED' as const }, dueAt: { $lt: new Date() } }]
          : q.overdue === 'false'
            ? [{ $or: [{ state: 'COMPLETED' as const }, { dueAt: { $gte: new Date() } }] }]
            : []),
      ],
    };
    const [rows, total] = await em.findAndCount(ActionPlan, filter, {
      populate: ['unit', 'sector', 'responsible'],
      limit: q.pageSize,
      offset: (q.page - 1) * q.pageSize,
      orderBy: { dueAt: 'asc', id: 'asc' },
    });
    return {
      data: rows.map((row) => this.summary(row)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async occurrences(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const q = parseHistoryQuery(raw),
      em = this.em.fork();
    await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
    const sectors = await em.find(
      Sector,
      {
        $and: [
          await this.access.sectorFilter(actor, requestId, em),
          { isActive: true, unit: { isActive: true } },
        ],
      },
      { fields: ['id'] },
    );
    if (!sectors.length) return { data: [], total: 0, page: q.page, pageSize: q.pageSize };
    const from = `from inspection_submission s join inspection i on i.id=s.inspection_id join form_version f on f.id=i.form_version_id join organization_unit u on u.id=i.unit_id join organization_sector sec on sec.id=i.sector_id cross join lateral jsonb_array_elements(s.nonconformities) n where i.sector_id=any(?::uuid[]) and not exists(select 1 from action_plan p where p.submission_id=s.id and p.question_id=(n->>'questionId')::uuid)`;
    const ids = '{' + sectors.map((sector) => sector.id).join(',') + '}';
    const count = await em.execute<{ total: string }[]>(`select count(*) as total ${from}`, [ids]);
    const data = await em.execute(
      `select s.id as "submissionId",n->>'questionId' as "questionId",(select q->>'label' from jsonb_array_elements(f.snapshot->'sections') a cross join lateral jsonb_array_elements(a->'questions') q where q->>'id'=n->>'questionId' limit 1) as "questionLabel", f.snapshot->>'title' as "inspectionTitle",u.id as "unitId",sec.id as "sectorId",u.name as "unitName",sec.name as "sectorName",n->>'category' as category,n->>'priority' as priority,s.completed_at as "completedAt" ${from} order by s.completed_at desc,s.id,n->>'questionId' limit ? offset ?`,
      [ids, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { data, total: Number(count[0]!.total), page: q.page, pageSize: q.pageSize };
  }
  async get(actor: AuthenticatedPrincipal, id: string, requestId: string) {
    const em = this.em.fork();
    return this.view(actor, await this.policy.load(actor, id, em, requestId), em);
  }
  async history(actor: AuthenticatedPrincipal, id: string, raw: unknown, requestId: string) {
    const q = parseHistoryQuery(raw),
      em = this.em.fork(),
      row = await this.policy.load(actor, id, em, requestId);
    return this.events(row, em, q.page, q.pageSize);
  }
  async create(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseActionCreate(raw);
    return this.em.fork().transactional(async (em) => {
      await this.policy.lockUsers(actor, em, [input.responsibleId]);
      const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
      const source = await em.findOne(InspectionSubmission, input.sourceSubmissionId, {
        populate: ['inspection'],
      });
      if (!source) throw new ForbiddenException('Ocorrência não permitida.');
      const inspection = source.inspection;
      await this.policy.scope(actor, inspection.unit.id, inspection.sector.id, em, requestId, true);
      await em.refresh(source, { lockMode: LockMode.PESSIMISTIC_WRITE });
      const occurrence = source.nonconformities.find(
        (item) => item.questionId === input.questionId,
      );
      if (!occurrence)
        throw new BadRequestException('A pergunta não gerou ocorrência nesta conclusão.');
      const prior = await em.findOne(ActionPlan, {
        submission: source.id,
        questionId: input.questionId,
      });
      if (prior) {
        const initial = await em.findOneOrFail(ActionPlanEvent, {
          actionPlan: prior.id,
          type: 'CREATED',
        });
        if (initial.commandHash !== hash(input))
          throw new ConflictException('Esta ocorrência já possui plano.');
        return this.view(actor, prior, em);
      }
      const responsible = await this.assignee(
          em,
          input.responsibleId,
          inspection.unit.id,
          inspection.sector.id,
        ),
        dueAt = deadline(input.dueDate);
      if (dueAt <= new Date()) throw new BadRequestException('O prazo precisa estar no futuro.');
      const row = new ActionPlan();
      Object.assign(row, {
        submission: source,
        questionId: input.questionId,
        unit: inspection.unit,
        sector: inspection.sector,
        responsible,
        createdBy: user,
        description: input.description,
        category: occurrence.category,
        priority: input.priority,
        dueDate: input.dueDate,
        dueAt,
      });
      em.persist(row);
      const event = new ActionPlanEvent();
      Object.assign(event, {
        actionPlan: row,
        actor: user,
        commandId: randomUUID(),
        commandHash: hash(input),
        resultRevision: 1,
        type: 'CREATED',
        toState: 'OPEN',
        text: input.description,
        assignment: {
          responsibleId: responsible.id,
          responsibleName: responsible.name,
          dueDate: row.dueDate,
          priority: row.priority,
        },
      });
      em.persist(event);
      await em.flush();
      await emitOnce(em, `action-assigned-${event.id}`, responsible.id, {
        kind: 'ACTION_ASSIGNED',
        resourceType: 'ACTION_PLAN',
        resourceId: row.id,
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'action_plan.created',
          resource: 'action_plan',
          resourceId: row.id,
          requestId,
          changes: {
            submissionId: source.id,
            questionId: input.questionId,
            responsibleId: responsible.id,
          },
        },
        em,
      );
      return this.view(actor, row, em);
    });
  }
  async command(actor: AuthenticatedPrincipal, id: string, raw: unknown, requestId: string) {
    const input = parseActionCommand(raw);
    return this.em.fork().transactional(async (em) => {
      const row = await this.policy.load(
        actor,
        id,
        em,
        requestId,
        true,
        input.responsibleId ? [input.responsibleId] : [],
      );
      const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
      const prior = await em.findOne(ActionPlanEvent, {
        actionPlan: row.id,
        commandId: input.commandId,
      });
      if (prior) {
        if (
          prior.actor.id !== user.id ||
          prior.commandHash !== hash(input) ||
          prior.resultRevision !== row.revision
        )
          throw new ConflictException('Comando já utilizado ou plano alterado.');
        return this.view(actor, row, em);
      }
      if (row.revision !== input.revision)
        throw new ConflictException('O plano foi alterado. Preserve o texto e recarregue.');
      const canManage = user.role !== 'COLLABORATOR',
        isResponsible = row.responsible.id === user.id;
      if (
        (['ASSIGN', 'APPROVE', 'RETURN'].includes(input.type) && !canManage) ||
        (['START', 'REQUEST_VALIDATION'].includes(input.type) && !isResponsible)
      )
        throw new ForbiddenException('Operação não permitida para este responsável.');
      const files = await em.find(EvidenceArtifact, {
        actionPlan: row.id,
        detachedAt: null,
        status: { $in: ['READY', 'PENDING', 'UPLOADED'] },
      });
      if (
        input.type === 'REQUEST_VALIDATION' &&
        files.some((file) => file.status !== 'READY' && file.expiresAt > new Date())
      )
        throw new ConflictException('Finalize ou cancele os envios pendentes.');
      let state;
      try {
        state = transition(
          row.state,
          { ...input, evidenceCount: files.filter((file) => file.status === 'READY').length },
          { canManage, isResponsible },
        );
      } catch {
        throw new BadRequestException(
          'Operação inválida. Confira estado, justificativa e evidência de correção.',
        );
      }
      if (input.type === 'ASSIGN') {
        if (!input.responsibleId || !input.description || !input.priority || !input.dueDate)
          throw new BadRequestException('Informe responsável, descrição, prioridade e prazo.');
        const dueAt = deadline(input.dueDate);
        if (dueAt <= new Date()) throw new BadRequestException('O prazo precisa estar no futuro.');
        Object.assign(row, {
          responsible: await this.assignee(em, input.responsibleId, row.unit.id, row.sector.id),
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate,
          dueAt,
        });
      }
      const event = new ActionPlanEvent();
      Object.assign(event, {
        actionPlan: row,
        actor: user,
        commandId: input.commandId,
        commandHash: hash(input),
        resultRevision: row.revision + 1,
        type: input.type,
        fromState: row.state,
        toState: state,
        text: input.type === 'ASSIGN' ? row.description : (input.text ?? null),
        assignment:
          input.type === 'ASSIGN'
            ? {
                responsibleId: row.responsible.id,
                responsibleName: row.responsible.name,
                dueDate: row.dueDate,
                priority: row.priority,
              }
            : null,
        evidence:
          input.type === 'REQUEST_VALIDATION'
            ? files.filter((file) => file.status === 'READY').map(evidenceView)
            : [],
      });
      em.persist(event);
      row.state = state;
      row.revision++;
      if (state === 'COMPLETED' && input.type === 'APPROVE') row.completedAt = new Date();
      await em.flush();
      if (input.type === 'REQUEST_VALIDATION') {
        for (const manager of await managers(em, row.unit.id, row.sector.id))
          await emitOnce(em, `action-review-${event.id}`, manager.id, {
            kind: 'ACTION_REVIEW',
            resourceType: 'ACTION_PLAN',
            resourceId: row.id,
          });
      } else if (input.type === 'ASSIGN' || input.type === 'APPROVE' || input.type === 'RETURN') {
        const kind =
          input.type === 'ASSIGN'
            ? 'ACTION_ASSIGNED'
            : input.type === 'APPROVE'
              ? 'ACTION_APPROVED'
              : 'ACTION_RETURNED';
        await emitOnce(em, `action-${input.type}-${event.id}`, row.responsible.id, {
          kind,
          resourceType: 'ACTION_PLAN',
          resourceId: row.id,
        });
      }
      await this.audit.record(
        {
          actorId: user.id,
          action: `action_plan.${input.type.toLowerCase()}`,
          resource: 'action_plan',
          resourceId: row.id,
          requestId,
          changes: { revision: row.revision, state },
        },
        em,
      );
      return this.view(actor, row, em);
    });
  }
}
