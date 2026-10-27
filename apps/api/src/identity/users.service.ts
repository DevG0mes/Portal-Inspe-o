import { ConflictException, NotFoundException } from '@nestjs/common';
import { LockMode, type FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal, UserSummary } from '@portal/contracts';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { PasswordService } from '../auth/password.service.js';
import { escapeLike, parseId, withUniqueConflict } from '../common/input.js';
import { User } from './user.entity.js';
import { Session } from './session.entity.js';
import { parseCreateUser, parseUpdateUser, parseUsersQuery, parseUserReset } from './users.dto.js';

const summary = (user: User): UserSummary => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  mustChangePassword: user.mustChangePassword,
});

export class UsersService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
  ) {}

  private write<T>(actor: AuthenticatedPrincipal, operation: (em: EntityManager) => Promise<T>) {
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        // Serializes administrator-state changes, including two simultaneous self-deactivations.
        await em.execute('select pg_advisory_xact_lock(27061004)');
        await this.access.assertAdministrator(actor, em);
        return operation(em);
      }),
    );
  }

  async list(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const query = parseUsersQuery(raw),
      em = this.entityManager.fork();
    await this.access.assertAdministrator(actor, em);
    const filter: FilterQuery<User> = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            $or: [
              { name: { $ilike: `%${escapeLike(query.q)}%` } },
              { email: { $ilike: `%${escapeLike(query.q)}%` } },
            ],
          }
        : {}),
    };
    const [rows, total] = await em.findAndCount(User, filter, {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
      orderBy: { name: 'asc', id: 'asc' },
    });
    await this.audit.record(
      {
        actorId: actor.userId,
        action: 'identity.users_read',
        resource: 'user',
        resourceId: 'list',
        requestId,
      },
      em,
    );
    return { data: rows.map(summary), total, page: query.page, pageSize: query.pageSize };
  }

  async get(actor: AuthenticatedPrincipal, rawId: string, requestId: string) {
    const id = parseId(rawId),
      em = this.entityManager.fork();
    await this.access.assertAdministrator(actor, em);
    const user = await em.findOne(User, id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    await this.audit.record(
      {
        actorId: actor.userId,
        action: 'identity.user_read',
        resource: 'user',
        resourceId: id,
        requestId,
      },
      em,
    );
    return summary(user);
  }

  async create(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseCreateUser(raw);
    await this.access.assertAdministrator(actor);
    const digest = await this.passwords.hash(input.password);
    return this.write(actor, async (em) => {
      const user = new User();
      user.name = input.name;
      user.email = input.email;
      user.role = input.role;
      user.passwordHash = digest;
      em.persist(user);
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'identity.user_created',
          resource: 'user',
          resourceId: user.id,
          requestId,
          changes: { name: user.name, email: user.email, role: user.role, isActive: user.isActive },
        },
        em,
      );
      return summary(user);
    });
  }

  async update(actor: AuthenticatedPrincipal, rawId: string, raw: unknown, requestId: string) {
    const id = parseId(rawId),
      input = parseUpdateUser(raw);
    return this.write(actor, async (em) => {
      const user = await em.findOne(User, id, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!user) throw new NotFoundException('Usuário não encontrado.');
      if (
        user.role === 'ADMIN' &&
        user.isActive &&
        (input.isActive === false || (input.role && input.role !== 'ADMIN'))
      ) {
        if ((await em.count(User, { id: { $ne: id }, role: 'ADMIN', isActive: true })) === 0) {
          throw new ConflictException('Mantenha ao menos um administrador ativo.');
        }
      }
      const before = summary(user);
      const revoke =
        input.isActive === false ||
        (input.role !== undefined && input.role !== user.role) ||
        (input.email !== undefined && input.email !== user.email);
      if (input.name !== undefined) user.name = input.name;
      if (input.email !== undefined) user.email = input.email;
      if (input.role !== undefined) user.role = input.role;
      if (input.isActive !== undefined) user.isActive = input.isActive;
      if (revoke)
        await em.nativeUpdate(Session, { user: id, revokedAt: null }, { revokedAt: new Date() });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'identity.user_updated',
          resource: 'user',
          resourceId: id,
          requestId,
          changes: { before, after: summary(user), sessionsRevoked: revoke },
        },
        em,
      );
      return summary(user);
    });
  }

  async resetPassword(
    actor: AuthenticatedPrincipal,
    rawId: string,
    raw: unknown,
    requestId: string,
  ) {
    const id = parseId(rawId),
      input = parseUserReset(raw);
    await this.access.assertAdministrator(actor);
    await this.auth.resetPassword(actor, id, input.newPassword, requestId);
  }
}
