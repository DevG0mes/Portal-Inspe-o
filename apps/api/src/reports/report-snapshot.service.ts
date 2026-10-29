import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import type {
  AuthenticatedPrincipal,
  ReportSnapshot,
  ReportScope,
  InspectionReportSnapshot,
  ReportFilters,
} from '@portal/contracts';
import { RuleEngine } from '@portal/form-engine';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { InspectionService } from '../inspections/inspection.service.js';
import { Inspection } from '../inspections/inspection.entity.js';
import { ActionPlan, ActionPlanEvent } from '../action-plans/action-plan.entity.js';
import { ActionPlanAccess } from '../action-plans/action-plan.access.js';
import { Sector } from '../organization/sector.entity.js';
import { User } from '../identity/user.entity.js';
import { InspectionAssignment } from '../schedules/schedule.entity.js';
import { EvidenceArtifact } from '../files/file.entity.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { analyticsQuery } from '../analytics/analytics.queries.js';
import { parseAnalytics } from '../analytics/analytics.dto.js';
const MAX_ROWS = 5000;
export class ReportSnapshotService {
  constructor(
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
  ) {}
  async inspection(
    actor: AuthenticatedPrincipal,
    id: string,
    submissionId: string | undefined,
    em: EntityManager,
    requestId: string,
  ): Promise<InspectionReportSnapshot> {
    const inspections = new InspectionService(em, this.access, this.audit);
    const root = await inspections.loadForEvidence(actor, id, em, requestId, false);
    await em.populate(root, ['unit', 'sector', 'formVersion']);
    const view = await inspections.get(actor, id, requestId, em),
      submission = submissionId
        ? view.submissions.find((s) => s.id === submissionId)
        : view.submissions.at(-1);
    if (!submission) throw new BadRequestException('Conclua a inspeção antes de solicitar o PDF.');
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em),
      completedBy = await em.findOneOrFail(User, submission.completedById);
    const candidates = await em.find(
      ActionPlan,
      { submission: submission.id },
      { populate: ['responsible'], orderBy: { createdAt: 'asc' }, limit: 1001 },
    );
    if (candidates.length > 1000)
      throw new BadRequestException('Relatório excede o limite de planos.');
    const plans: InspectionReportSnapshot['plans'] = [],
      policy = new ActionPlanAccess(this.access);
    let eventCount = 0;
    for (const p of candidates) {
      try {
        await policy.load(actor, p.id, em, requestId);
      } catch (e) {
        if (e instanceof ForbiddenException) continue;
        throw e;
      }
      const events = await em.find(
        ActionPlanEvent,
        { actionPlan: p.id },
        { populate: ['actor'], orderBy: { createdAt: 'asc', id: 'asc' }, limit: 1001 },
      );
      eventCount += events.length;
      if (eventCount > 1000)
        throw new BadRequestException('Histórico excede o limite do relatório.');
      plans.push({
        id: p.id,
        description: p.description,
        state: p.state,
        priority: p.priority,
        dueDate: p.dueDate,
        responsibleName: p.responsible.name,
        history: events.map((e) => ({
          id: e.id,
          type: e.type,
          actorName: e.actor.name,
          createdAt: e.createdAt.toISOString(),
          fromState: e.fromState,
          toState: e.toState,
          text: e.text,
          evidence: e.evidence,
          assignment: e.assignment,
        })),
      });
    }
    const files = [
        ...submission.evidence,
        ...plans.flatMap((p) => p.history.flatMap((e) => e.evidence)),
      ],
      ids = [...new Set(files.map((f) => f.id))];
    const stored = ids.length
      ? await em.find(EvidenceArtifact, { id: { $in: ids }, status: 'READY' })
      : [];
    return {
      kind: 'INSPECTION',
      requestedAt: new Date().toISOString(),
      requestedBy: user.name,
      inspectionId: id,
      unitName: root.unit.name,
      sectorName: root.sector.name,
      versionNumber: root.formVersion.number,
      form: view.snapshot,
      visibleQuestionIds: new RuleEngine().evaluate(view.snapshot, submission.answers)
        .visibleQuestionIds,
      submission,
      completedByName: completedBy.name,
      plans,
      scope: {
        role: user.role,
        sectorIds: [root.sector.id],
        inspectionIds: [id],
        assignmentIds: [],
        planIds: plans.map((p) => p.id),
      },
      assets: stored
        .filter((f) => f.inspection?.id === id || plans.some((p) => p.id === f.actionPlan?.id))
        .map((f) => ({ id: f.id, key: f.finalKey, mime: f.mime, sha256: f.sha256 })),
    };
  }
  async analytics(
    actor: AuthenticatedPrincipal,
    filters: ReportFilters,
    em: EntityManager,
    requestId: string,
  ): Promise<ReportSnapshot> {
    const q = parseAnalytics(filters),
      user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em),
      scope = await this.access.sectorFilter(actor, requestId, em);
    const sectors = await em.find(Sector, {
      $and: [
        scope,
        { isActive: true, unit: { isActive: true } },
        ...(q.unitId ? [{ unit: q.unitId }] : []),
        ...(q.sectorId ? [{ id: q.sectorId }] : []),
      ],
    });
    const api = new AnalyticsService(em, this.access, em),
      summary = await api.summary(actor, filters, requestId),
      trends = await api.trends(actor, filters, requestId);
    const first = await api.occurrences(actor, { ...filters, page: 1, pageSize: 100 }, requestId),
      planFirst = await api.plans(actor, { ...filters, page: 1, pageSize: 100 }, requestId);
    if (first.total > MAX_ROWS || planFirst.total > MAX_ROWS)
      throw new BadRequestException(
        'Reduza o período ou os filtros: limite de 5.000 registros por lista.',
      );
    const occurrences = [...first.data],
      plans = [...planFirst.data];
    for (let page = 2; occurrences.length < first.total; page++)
      occurrences.push(
        ...(await api.occurrences(actor, { ...filters, page, pageSize: 100 }, requestId)).data,
      );
    for (let page = 2; plans.length < planFirst.total; page++)
      plans.push(...(await api.plans(actor, { ...filters, page, pageSize: 100 }, requestId)).data);
    const sql = analyticsQuery(
      q,
      sectors.map((s) => s.id),
      user.role === 'COLLABORATOR' ? user.id : null,
      new Date(),
    );
    const inspections: { id: string }[] = await em.execute(
      `${sql.cte} select inspection_id as id from selected union select id from drafts limit 5001`,
      sql.args,
    );
    const assignments: { id: string }[] = await em.execute(
      `${sql.cte} select id from assignments limit 5001`,
      sql.args,
    );
    if (inspections.length > MAX_ROWS || assignments.length > MAX_ROWS)
      throw new BadRequestException('Reduza o período ou os filtros para exportar.');
    return {
      kind: 'ANALYTICS',
      requestedAt: new Date().toISOString(),
      requestedBy: user.name,
      filters: { ...filters, from: q.from, to: q.to },
      summary,
      trends: trends.data,
      occurrences,
      groups: first.groups,
      plans,
      scope: {
        role: user.role,
        sectorIds: sectors.map((s) => s.id),
        inspectionIds: inspections.map((i) => i.id),
        assignmentIds: assignments.map((a) => a.id),
        planIds: plans.map((p) => p.id),
      },
    };
  }
  async authorize(
    actor: AuthenticatedPrincipal,
    snapshot: ReportSnapshot,
    em: EntityManager,
    requestId: string,
  ) {
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    if (user.role !== snapshot.scope.role) throw new ForbiddenException('Acesso alterado.');
    const scope = await this.access.sectorFilter(actor, requestId, em),
      guard: ReportScope = snapshot.scope;
    if (
      guard.sectorIds.length !==
      (await em.count(Sector, {
        $and: [scope, { id: { $in: guard.sectorIds }, isActive: true, unit: { isActive: true } }],
      }))
    )
      throw new ForbiddenException('Escopo alterado.');
    if (
      guard.inspectionIds.length !==
      (await em.count(Inspection, {
        id: { $in: guard.inspectionIds },
        ...(user.role === 'COLLABORATOR'
          ? {
              $or: [
                { createdBy: user.id },
                { assignment: { responsibles: { $some: { user: user.id } } } },
              ],
            }
          : {}),
      }))
    )
      throw new ForbiddenException('Responsabilidade alterada.');
    if (
      guard.planIds.length !==
      (await em.count(ActionPlan, {
        id: { $in: guard.planIds },
        ...(user.role === 'COLLABORATOR' ? { responsible: user.id } : {}),
      }))
    )
      throw new ForbiddenException('Responsabilidade alterada.');
    if (
      guard.assignmentIds.length !==
      (await em.count(InspectionAssignment, {
        id: { $in: guard.assignmentIds },
        ...(user.role === 'COLLABORATOR' ? { responsibles: { $some: { user: user.id } } } : {}),
      }))
    )
      throw new ForbiddenException('Responsabilidade alterada.');
  }
}
