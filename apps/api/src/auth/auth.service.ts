import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal, ChangePasswordInput, LoginInput } from '@portal/contracts';
import { User } from '../identity/user.entity.js';
import { Session } from '../identity/session.entity.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from './password.service.js';
import { SESSION_TTL_MS, MAX_LOGIN_FAILURES, LOGIN_LOCK_DURATION_MS } from './auth.policy.js';
import { parseResetPassword } from './dto/reset-password.dto.js';

const invalidCredentials = () => new UnauthorizedException('Credenciais inválidas.');
const digestToken = (token: string) => createHash('sha256').update(token).digest('hex');

function principal(user: User, session: Session): AuthenticatedPrincipal {
  return {
    userId: user.id,
    role: user.role,
    sessionId: session.id,
    mustChangePassword: user.mustChangePassword,
  };
}

export class AuthService {
  private readonly dummyDigest: Promise<string>;

  constructor(
    private readonly entityManager: EntityManager,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
  ) {
    // Unknown accounts still perform the same costly verification, without storing their identifiers.
    this.dummyDigest = passwords.hash(randomBytes(32).toString('base64url'));
  }

  private createSession(em: EntityManager, user: User, now: Date) {
    const token = randomBytes(32).toString('base64url');
    const session = new Session();
    session.user = user;
    session.tokenHash = digestToken(token);
    session.expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    em.persist(session);
    return { token, principal: principal(user, session) };
  }

  async login(input: LoginInput, requestId: string, presentedToken?: string) {
    const result = await this.entityManager.fork().transactional(async (em) => {
      // Serialize attempts per account: concurrent requests cannot overwrite the failure counter.
      const user = await em.findOne(
        User,
        { email: input.email },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const valid = await this.passwords.verify(
        user?.passwordHash ?? (await this.dummyDigest),
        input.password,
      );
      const now = new Date();
      const locked = !!user?.lockedUntil && user.lockedUntil > now;
      if (user?.lockedUntil && !locked) {
        user.lockedUntil = null;
        user.failedLoginAttempts = 0;
      }

      if (!user || !valid || !user.isActive || locked) {
        if (user?.isActive && !locked) {
          user.failedLoginAttempts++;
          if (user.failedLoginAttempts >= MAX_LOGIN_FAILURES)
            user.lockedUntil = new Date(now.getTime() + LOGIN_LOCK_DURATION_MS);
        }
        await this.audit.record(
          {
            actorId: user?.id,
            action: 'auth.login_failed',
            resource: 'authentication',
            resourceId: user?.id ?? 'unknown',
            requestId,
          },
          em,
        );
        // Return a failure value so the transaction commits its counter and audit before throwing.
        return undefined;
      }

      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      if (presentedToken) {
        await em.nativeUpdate(
          Session,
          { user: user.id, tokenHash: digestToken(presentedToken), revokedAt: null },
          { revokedAt: now },
        );
      }
      const session = this.createSession(em, user, now);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'auth.login',
          resource: 'session',
          resourceId: session.principal.sessionId,
          requestId,
        },
        em,
      );
      return session;
    });
    if (!result) throw invalidCredentials();
    return result;
  }

  async authenticate(token: string): Promise<AuthenticatedPrincipal> {
    const session = await this.entityManager.findOne(
      Session,
      { tokenHash: digestToken(token), revokedAt: null, expiresAt: { $gt: new Date() } },
      { populate: ['user'] },
    );
    if (!session?.user.isActive) throw invalidCredentials();
    return principal(session.user, session);
  }

  async logout(actor: AuthenticatedPrincipal, requestId: string) {
    await this.entityManager.fork().transactional(async (em) => {
      await em.nativeUpdate(
        Session,
        { id: actor.sessionId, user: actor.userId, revokedAt: null },
        { revokedAt: new Date() },
      );
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'auth.logout',
          resource: 'session',
          resourceId: actor.sessionId,
          requestId,
        },
        em,
      );
    });
  }

  async logoutAll(actor: AuthenticatedPrincipal, requestId: string) {
    await this.entityManager.fork().transactional(async (em) => {
      await em.findOneOrFail(User, actor.userId, { lockMode: LockMode.PESSIMISTIC_WRITE });
      await em.nativeUpdate(
        Session,
        { user: actor.userId, revokedAt: null },
        { revokedAt: new Date() },
      );
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'auth.sessions_revoked',
          resource: 'user',
          resourceId: actor.userId,
          requestId,
        },
        em,
      );
    });
  }

  async changePassword(
    actor: AuthenticatedPrincipal,
    input: ChangePasswordInput,
    requestId: string,
  ) {
    if (input.currentPassword === input.newPassword)
      throw new BadRequestException('Escolha uma senha diferente da atual.');
    const newDigest = await this.passwords.hash(input.newPassword);
    const result = await this.entityManager.fork().transactional(async (em) => {
      const user = await em.findOneOrFail(User, actor.userId, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      const session = await em.findOne(Session, {
        id: actor.sessionId,
        user: user.id,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      });
      if (
        !session ||
        !user.isActive ||
        !(await this.passwords.verify(user.passwordHash, input.currentPassword))
      ) {
        await this.audit.record(
          {
            actorId: user.id,
            action: 'auth.password_change_failed',
            resource: 'user',
            resourceId: user.id,
            requestId,
          },
          em,
        );
        return undefined;
      }
      const now = new Date();
      user.passwordHash = newDigest;
      user.mustChangePassword = false;
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await em.nativeUpdate(Session, { user: user.id, revokedAt: null }, { revokedAt: now });
      const replacement = this.createSession(em, user, now);
      await this.audit.record(
        {
          actorId: user.id,
          action: 'auth.password_changed',
          resource: 'user',
          resourceId: user.id,
          requestId,
        },
        em,
      );
      return replacement;
    });
    if (!result) throw invalidCredentials();
    return result;
  }

  /** Internal administrative use; a public reset endpoint belongs to user administration. */
  async resetPassword(
    actor: AuthenticatedPrincipal,
    userId: string,
    newPassword: string,
    requestId: string,
  ) {
    const input = parseResetPassword({ userId, newPassword });
    if (actor.role !== 'ADMIN' || actor.mustChangePassword) throw new ForbiddenException();
    const digest = await this.passwords.hash(input.newPassword);
    await this.entityManager.fork().transactional(async (em) => {
      const administrator = await em.findOne(User, {
        id: actor.userId,
        role: 'ADMIN',
        isActive: true,
        mustChangePassword: false,
      });
      if (!administrator) throw new ForbiddenException();
      const user = await em.findOne(User, input.userId, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!user) throw new NotFoundException('Usuário não encontrado.');
      user.passwordHash = digest;
      user.mustChangePassword = true;
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await em.nativeUpdate(Session, { user: user.id, revokedAt: null }, { revokedAt: new Date() });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'auth.password_reset',
          resource: 'user',
          resourceId: user.id,
          requestId,
        },
        em,
      );
    });
  }
}
