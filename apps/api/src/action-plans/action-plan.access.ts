import { ForbiddenException } from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal } from '@portal/contracts';
import { AccessPolicy } from '../access/access-policy.service.js';
import { User } from '../identity/user.entity.js';
import { Unit } from '../organization/unit.entity.js';
import { Sector } from '../organization/sector.entity.js';
import { parseId } from '../common/input.js';
import { ActionPlan } from './action-plan.entity.js';
export class ActionPlanAccess {
  constructor(private readonly access: AccessPolicy) {}
  async lockUsers(actor: AuthenticatedPrincipal, em: EntityManager, extra: string[] = []) {
    for (const id of [...new Set([actor.userId, ...extra])].sort())
      await em.findOne(User, id, { lockMode: LockMode.PESSIMISTIC_READ, refresh: true });
  }
  async scope(
    actor: AuthenticatedPrincipal,
    unitId: string,
    sectorId: string,
    em: EntityManager,
    requestId: string,
    lock: boolean,
  ) {
    if (lock) {
      await em.findOne(Unit, unitId, { lockMode: LockMode.PESSIMISTIC_READ, refresh: true });
      await em.findOne(Sector, sectorId, { lockMode: LockMode.PESSIMISTIC_READ, refresh: true });
    }
    await this.access.assertUnitSector(actor, unitId, sectorId, requestId, em);
  }
  async load(
    actor: AuthenticatedPrincipal,
    id: string,
    em: EntityManager,
    requestId: string,
    write = false,
    extra: string[] = [],
    executeOnly = false,
  ) {
    if (write) await this.lockUsers(actor, em, extra);
    const row = await em.findOne(ActionPlan, parseId(id));
    if (!row) throw new ForbiddenException('Plano de ação não permitido.');
    await this.scope(actor, row.unit.id, row.sector.id, em, requestId, write);
    if (write) await em.refresh(row, { lockMode: LockMode.PESSIMISTIC_WRITE });
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER'], em);
    if (executeOnly && row.responsible.id !== user.id)
      throw new ForbiddenException('Plano de ação não permitido.');
    return row;
  }
  async sourceEvidence(
    actor: AuthenticatedPrincipal,
    inspectionId: string,
    questionId: string,
    fileId: string,
    em: EntityManager,
    requestId: string,
  ) {
    const rows = await em.find(
      ActionPlan,
      { responsible: actor.userId, questionId, submission: { inspection: inspectionId } },
      { populate: ['submission'] },
    );
    for (const plan of rows)
      if (
        plan.submission.evidence.some(
          (file) => file.id === fileId && file.questionId === questionId,
        )
      ) {
        await this.load(actor, plan.id, em, requestId);
        return;
      }
    throw new ForbiddenException('Evidência não permitida.');
  }
}
