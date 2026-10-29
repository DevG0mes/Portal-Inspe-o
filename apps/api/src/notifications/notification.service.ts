import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal, NotificationView } from '@portal/contracts';
import { AccessPolicy } from '../access/access-policy.service.js';
import { ActionPlanAccess } from '../action-plans/action-plan.access.js';
import { InspectionAssignment } from '../schedules/schedule.entity.js';
import { Notification } from './notification.entity.js';
const query = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    unread: z.enum(['true', 'false']).optional(),
  })
  .strict();
export class NotificationService {
  constructor(
    private readonly em: EntityManager,
    private readonly access: AccessPolicy,
    private readonly plans: ActionPlanAccess,
  ) {}
  private async link(
    actor: AuthenticatedPrincipal,
    row: Notification,
    em: EntityManager,
    requestId: string,
  ): Promise<{ href: string; title: string } | null> {
    try {
      if (row.resourceType === 'ACTION_PLAN') {
        const plan = await this.plans.load(actor, row.resourceId, em, requestId);
        return { href: `/action-plans/${row.resourceId}`, title: plan.description };
      }
      const assignment = await em.findOne(InspectionAssignment, row.resourceId, {
        populate: ['schedule', 'responsibles'],
      });
      if (!assignment) return null;
      await this.access.assertUnitSector(
        actor,
        assignment.schedule.unit.id,
        assignment.schedule.sector.id,
        requestId,
        em,
      );
      const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
      return user.role !== 'COLLABORATOR' ||
        assignment.responsibles.getItems().some((link) => link.user.id === user.id)
        ? { href: '/assignments', title: assignment.schedule.name }
        : null;
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) return null;
      throw error;
    }
  }
  async list(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const parsed = query.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Paginação ou filtro inválido.');
    const q = parsed.data,
      em = this.em.fork();
    await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const [rows, total] = await em.findAndCount(
      Notification,
      { recipient: actor.userId, ...(q.unread === 'true' ? { readAt: null } : {}) },
      {
        orderBy: { createdAt: 'desc', id: 'desc' },
        limit: q.pageSize,
        offset: (q.page - 1) * q.pageSize,
      },
    );
    const data: NotificationView[] = [];
    for (const row of rows) {
      const target = await this.link(actor, row, em, requestId);
      data.push({
        id: row.id,
        kind: row.kind,
        resourceId: row.resourceId,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
        href: target?.href ?? null,
        resourceTitle: target?.title ?? null,
      });
    }
    return { data, total, page: q.page, pageSize: q.pageSize };
  }
  async count(actor: AuthenticatedPrincipal) {
    await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR']);
    return {
      count: await this.em.fork().count(Notification, { recipient: actor.userId, readAt: null }),
    };
  }
  async read(actor: AuthenticatedPrincipal, id?: string) {
    const em = this.em.fork();
    await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    if (id !== undefined && !z.uuid().safeParse(id).success)
      throw new BadRequestException('Identificador inválido.');
    if (id && !(await em.count(Notification, { id, recipient: actor.userId })))
      throw new NotFoundException('Notificação inexistente.');
    await em.nativeUpdate(
      Notification,
      {
        recipient: actor.userId,
        readAt: null,
        ...(id ? { id } : {}),
        createdAt: { $lte: new Date() },
      },
      { readAt: new Date() },
    );
    return { ok: true };
  }
}
