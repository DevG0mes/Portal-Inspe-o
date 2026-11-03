import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IsolationLevel, LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal, ReportSnapshot, ReportView } from '@portal/contracts';
import { User } from '../identity/user.entity.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { parseId } from '../common/input.js';
import type { StorageAdapter } from '../files/storage.adapter.js';
import { ReportRequest } from './report-request.entity.js';
import { ReportSnapshotService } from './report-snapshot.service.js';
import { parseReportInput, parseReportQuery } from './reports.dto.js';
const digest = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');
export type ReportRenderer = (
  snapshot: ReportSnapshot,
  read: (key: string, max: number) => Promise<Buffer>,
) => Promise<Buffer>;
export class ReportsService {
  private readonly snapshots: ReportSnapshotService;
  constructor(
    private readonly em: EntityManager,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
    private readonly storage: StorageAdapter,
  ) {
    this.snapshots = new ReportSnapshotService(access, audit);
  }
  private view(
    row: Pick<
      ReportRequest,
      | 'id'
      | 'format'
      | 'state'
      | 'createdAt'
      | 'completedAt'
      | 'size'
      | 'sha256'
      | 'errorCode'
      | 'attempts'
    >,
  ): ReportView {
    return {
      id: row.id,
      format: row.format,
      state: row.state,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      size: row.size,
      sha256: row.sha256,
      errorCode: row.errorCode,
      canRetry:
        row.attempts > 0 &&
        row.state === 'FAILED' &&
        row.errorCode === 'GENERATION_FAILED' &&
        row.attempts < 5,
    };
  }
  private async owned(actor: AuthenticatedPrincipal, id: string, em: EntityManager, lock = false) {
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const row = await em.findOne(
      ReportRequest,
      {
        id: parseId(id),
        requestedBy: actor.userId,
        ...(user.role === 'COLLABORATOR' ? { format: 'PDF' } : {}),
      },
      lock ? { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } : {},
    );
    if (!row) throw new NotFoundException('Relatório inexistente.');
    return row;
  }
  async create(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseReportInput(raw),
      hash = digest(JSON.stringify(input));
    // Reserve in READ COMMITTED with one connection and user → report lock order.
    const reservation = await this.em.fork().transactional(async (em) => {
      await em.findOne(User, actor.userId, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
      await this.access.requireRoles(
        actor,
        input.format === 'XLSX' ? ['ADMIN', 'MANAGER'] : ['ADMIN', 'MANAGER', 'COLLABORATOR'],
        em,
      );
      const prior = await em.findOne(ReportRequest, {
        requestedBy: actor.userId,
        requestId: input.requestId,
      });
      if (prior) {
        if (prior.requestHash !== hash)
          throw new ConflictException('Identificador reutilizado com outro pedido.');
        return { row: prior, created: false };
      }
      if (
        (await em.count(ReportRequest, {
          requestedBy: actor.userId,
          state: { $in: ['QUEUED', 'PROCESSING'] },
        })) >= 3
      )
        throw new ConflictException('Aguarde seus relatórios pendentes antes de solicitar outro.');
      const row = new ReportRequest();
      Object.assign(row, {
        requestedBy: em.getReference(User, actor.userId),
        requestId: input.requestId,
        requestHash: hash,
        format: input.format,
      });
      em.persist(row);
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'reports.preparing',
          resource: 'report',
          resourceId: row.id,
          requestId,
        },
        em,
      );
      return { row, created: true };
    });
    if (!reservation.created) return this.view(reservation.row);
    try {
      // Preparation starts after reservation committed; no transaction waits for another pool connection.
      return await this.em.fork().transactional(
        async (em) => {
          const snapshot =
            input.format === 'PDF'
              ? await this.snapshots.inspection(
                  actor,
                  input.inspectionId,
                  input.submissionId,
                  em,
                  requestId,
                )
              : await this.snapshots.analytics(actor, input.filters, em, requestId);
          if (Buffer.byteLength(JSON.stringify(snapshot)) > 8 * 1024 * 1024)
            throw new BadRequestException('Reduza o conteúdo do relatório.');
          const row = await em.findOneOrFail(ReportRequest, reservation.row.id, {
            lockMode: LockMode.PESSIMISTIC_WRITE,
            refresh: true,
          });
          if (row.state !== 'QUEUED' || row.snapshot)
            throw new ConflictException('Preparação encerrada. Solicite outro relatório.');
          row.snapshot = snapshot;
          await this.audit.record(
            {
              actorId: actor.userId,
              action: 'reports.requested',
              resource: 'report',
              resourceId: row.id,
              requestId,
              changes: { format: row.format },
            },
            em,
          );
          return this.view(row);
        },
        { isolationLevel: IsolationLevel.REPEATABLE_READ },
      );
    } catch (error) {
      await this.em.fork().transactional(async (em) => {
        const row = await em.findOneOrFail(ReportRequest, reservation.row.id, {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        });
        if (row.snapshot) return;
        row.state = 'FAILED';
        row.errorCode =
          error instanceof ForbiddenException ? 'ACCESS_CHANGED' : 'REQUEST_INCOMPLETE';
        await em.flush();
      });
      throw error;
    }
  }
  async list(actor: AuthenticatedPrincipal, raw: unknown) {
    const q = parseReportQuery(raw),
      em = this.em.fork();
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const [rows, total] = await em.findAndCount(
      ReportRequest,
      { requestedBy: actor.userId, ...(user.role === 'COLLABORATOR' ? { format: 'PDF' } : {}) },
      {
        fields: [
          'id',
          'format',
          'state',
          'createdAt',
          'completedAt',
          'size',
          'sha256',
          'errorCode',
          'attempts',
        ],
        orderBy: { createdAt: 'desc', id: 'desc' },
        limit: q.pageSize,
        offset: (q.page - 1) * q.pageSize,
      },
    );
    return { data: rows.map((r) => this.view(r)), total, page: q.page, pageSize: q.pageSize };
  }
  async get(actor: AuthenticatedPrincipal, id: string) {
    return this.view(await this.owned(actor, id, this.em.fork()));
  }
  async retry(actor: AuthenticatedPrincipal, id: string, requestId: string) {
    return this.em.fork().transactional(async (em) => {
      await em.findOne(User, actor.userId, { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true });
      const row = await this.owned(actor, id, em, true);
      if (row.state === 'QUEUED' || row.state === 'PROCESSING') return this.view(row);
      if (row.state !== 'FAILED' || row.attempts >= 5 || !row.snapshot)
        throw new ConflictException('Este relatório não pode ser reprocessado. Solicite um novo.');
      if (
        (await em.count(ReportRequest, {
          requestedBy: actor.userId,
          state: { $in: ['QUEUED', 'PROCESSING'] },
        })) >= 3
      )
        throw new ConflictException('Aguarde seus relatórios pendentes antes de tentar novamente.');
      await this.snapshots.authorize(actor, row.snapshot, em, requestId);
      row.state = 'QUEUED';
      row.errorCode = null;
      row.leaseUntil = null;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'reports.retried',
          resource: 'report',
          resourceId: id,
          requestId,
        },
        em,
      );
      return this.view(row);
    });
  }
  async download(actor: AuthenticatedPrincipal, id: string, requestId: string) {
    const em = this.em.fork(),
      row = await this.owned(actor, id, em);
    if (row.state !== 'READY' || !row.objectKey || !row.snapshot)
      throw new ConflictException('O arquivo ainda não está pronto.');
    await this.snapshots.authorize(actor, row.snapshot, em, requestId);
    await this.audit.record(
      {
        actorId: actor.userId,
        action: 'reports.download',
        resource: 'report',
        resourceId: id,
        requestId,
      },
      em,
    );
    return {
      url: await this.storage.downloadUrl(
        row.objectKey,
        `portal-relatorio-${row.id}.${row.format.toLowerCase()}`,
        row.format === 'PDF'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
      expiresIn: 60,
    };
  }
  async due() {
    await this.em
      .fork()
      .nativeUpdate(
        ReportRequest,
        { state: 'QUEUED', snapshot: null, createdAt: { $lt: new Date(Date.now() - 15 * 60000) } },
        { state: 'FAILED', errorCode: 'REQUEST_INCOMPLETE' },
      );
    return this.em.fork().find(
      ReportRequest,
      {
        snapshot: { $ne: null },
        $or: [{ state: 'QUEUED' }, { state: 'PROCESSING', leaseUntil: { $lt: new Date() } }],
      },
      { fields: ['id', 'attempts'], limit: 100, orderBy: { createdAt: 'asc' } },
    );
  }
  /** Only the attempt that owns the lease may publish; every storage key is persisted before I/O. */
  async generate(id: string, render: ReportRenderer) {
    const claim = await this.em.fork().transactional(async (em) => {
      const row = await em.findOne(ReportRequest, parseId(id), {
        lockMode: LockMode.PESSIMISTIC_WRITE,
        populate: ['requestedBy'],
      });
      if (
        !row ||
        !row.snapshot ||
        row.state === 'READY' ||
        row.state === 'FAILED' ||
        (row.state === 'PROCESSING' && row.leaseUntil! > new Date())
      )
        return null;
      if (row.attempts >= 5) {
        row.state = 'FAILED';
        row.errorCode = 'GENERATION_FAILED';
        await em.flush();
        return null;
      }
      row.state = 'PROCESSING';
      row.attempts++;
      row.leaseUntil = new Date(Date.now() + 15 * 60000);
      row.objectKey = `reports/${row.id}/${row.attempts}.${row.format.toLowerCase()}`;
      row.artifactKeys.push(row.objectKey);
      row.cleanupAt = new Date();
      row.errorCode = null;
      await em.flush();
      const actor: AuthenticatedPrincipal = {
        userId: row.requestedBy.id,
        role: row.requestedBy.role,
        sessionId: 'report-worker',
        mustChangePassword: false,
      };
      return {
        actor,
        snapshot: row.snapshot,
        key: row.objectKey,
        attempt: row.attempts,
        format: row.format,
      };
    });
    if (!claim) return { skipped: true };
    try {
      await this.snapshots.authorize(claim.actor, claim.snapshot, this.em.fork(), randomUUID());
      const bytes = await render(claim.snapshot, (key, max) => this.storage.read(key, max));
      if (!bytes.length || bytes.length > 30 * 1024 * 1024)
        throw new BadRequestException('Report size limit');
      await this.storage.ensureBucket();
      await this.storage.put(
        claim.key,
        bytes,
        claim.format === 'PDF'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const accepted = await this.em.fork().transactional(async (em) => {
        const row = await em.findOneOrFail(ReportRequest, id, {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        });
        if (row.attempts !== claim.attempt || row.state !== 'PROCESSING') return false;
        await this.snapshots.authorize(claim.actor, claim.snapshot, em, randomUUID());
        row.state = 'READY';
        row.leaseUntil = null;
        row.size = bytes.length;
        row.sha256 = digest(bytes);
        row.completedAt = new Date();
        row.cleanupAt = row.artifactKeys.length > 1 ? new Date() : null;
        await this.audit.record(
          {
            actorId: claim.actor.userId,
            action: 'reports.ready',
            resource: 'report',
            resourceId: id,
            requestId: randomUUID(),
            changes: { attempt: claim.attempt, size: bytes.length },
          },
          em,
        );
        return true;
      });
      if (!accepted)
        await this.em.fork().transactional(async (em) => {
          const row = await em.findOneOrFail(ReportRequest, id, {
            lockMode: LockMode.PESSIMISTIC_WRITE,
            refresh: true,
          });
          if (row.state !== 'READY' || row.objectKey !== claim.key)
            await this.storage.remove(claim.key);
        });
      return { ready: accepted };
    } catch (error) {
      const committed = await this.em.fork().transactional(async (em) => {
        const row = await em.findOneOrFail(ReportRequest, id, {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        });
        // A lost COMMIT acknowledgement can leave READY. Never compensate its current artifact.
        if (row.state === 'READY' && row.objectKey === claim.key) return true;
        await this.storage.remove(claim.key).catch(() => {});
        if (row.attempts !== claim.attempt || row.state !== 'PROCESSING') return false;
        row.state = 'FAILED';
        row.leaseUntil = null;
        row.cleanupAt = new Date();
        row.errorCode =
          error instanceof ForbiddenException
            ? 'ACCESS_CHANGED'
            : error instanceof BadRequestException
              ? 'TOO_LARGE'
              : 'GENERATION_FAILED';
        await this.audit.record(
          {
            actorId: claim.actor.userId,
            action: 'reports.failed',
            resource: 'report',
            resourceId: id,
            requestId: randomUUID(),
            changes: { code: row.errorCode, attempt: claim.attempt },
          },
          em,
        );
        return false;
      });
      return { ready: committed };
    }
  }
  /** Retain key history and revisit obsolete attempts so a crashed late upload is eventually removed. */
  async cleanup() {
    const rows = await this.em
      .fork()
      .find(
        ReportRequest,
        { cleanupAt: { $lte: new Date() } },
        { fields: ['id'], limit: 100, orderBy: { cleanupAt: 'asc' } },
      );
    let cleaned = 0;
    for (const candidate of rows)
      await this.em.fork().transactional(async (em) => {
        const row = await em.findOneOrFail(ReportRequest, candidate.id, {
          lockMode: LockMode.PESSIMISTIC_WRITE,
          refresh: true,
        });
        for (const key of row.artifactKeys) {
          if (key === row.objectKey && (row.state === 'READY' || row.state === 'PROCESSING'))
            continue;
          await this.storage.remove(key);
          cleaned++;
        }
        row.cleanupAt = new Date(Date.now() + 86400000);
        await em.flush();
      });
    return { cleaned };
  }
}
