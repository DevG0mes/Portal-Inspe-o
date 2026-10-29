import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal } from '@portal/contracts';
import { RuleEngine } from '@portal/form-engine';
import { parseId } from '../common/input.js';
import { User } from '../identity/user.entity.js';
import { Inspection } from '../inspections/inspection.entity.js';
import { InspectionService } from '../inspections/inspection.service.js';
import { ActionPlan } from '../action-plans/action-plan.entity.js';
import { ActionPlanAccess } from '../action-plans/action-plan.access.js';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EvidenceArtifact, evidenceView } from './file.entity.js';
import { parseFileRevision, parsePrepareFile } from './files.dto.js';
import { MIME_EXTENSIONS, validateContent, validateMetadata } from './file-validation.js';
import type { StorageAdapter } from './storage.adapter.js';

export class FileService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly inspections: InspectionService,
    private readonly audit: AuditService,
    private readonly storage: StorageAdapter,
    private readonly maxBytes = 10 * 1024 * 1024,
    private readonly now = () => new Date(),
    private readonly actionAccess = new ActionPlanAccess(new AccessPolicy(entityManager, audit)),
  ) {}
  policy() {
    return {
      maxBytes: this.maxBytes,
      maxFiles: 20,
      allowedMimeTypes: Object.keys(MIME_EXTENSIONS),
      accept: Object.values(MIME_EXTENSIONS)
        .flat()
        .map((ext) => `.${ext}`)
        .join(','),
    };
  }
  private root(row: Inspection | ActionPlan) {
    return row instanceof Inspection ? { inspection: row.id } : { actionPlan: row.id };
  }
  private isEditable(row: Inspection | ActionPlan) {
    return row instanceof Inspection ? row.state === 'DRAFT' : row.state === 'IN_PROGRESS';
  }
  private async files(row: Inspection | ActionPlan, em: EntityManager) {
    return (
      await em.find(
        EvidenceArtifact,
        { ...this.root(row), detachedAt: null, status: { $in: ['PENDING', 'UPLOADED', 'READY'] } },
        { orderBy: { createdAt: 'asc', id: 'asc' } },
      )
    ).map(evidenceView);
  }
  private async editable(row: Inspection | ActionPlan, file: EvidenceArtifact, em: EntityManager) {
    if (!this.isEditable(row) || file.detachedAt || file.status === 'CLEANED')
      throw new ConflictException('Evidência não está disponível para alteração.');
    if (row instanceof ActionPlan) {
      if (row.questionId !== file.questionId) throw new ConflictException('Ocorrência incorreta.');
      return;
    }
    await em.populate(row, ['formVersion']);
    if (
      !new RuleEngine()
        .evaluate(row.formVersion.snapshot, row.answers)
        .visibleQuestionIds.includes(file.questionId)
    )
      throw new ConflictException('A pergunta não está visível no preenchimento atual.');
  }
  private async load(
    actor: AuthenticatedPrincipal,
    id: string,
    em: EntityManager,
    requestId: string,
    write: boolean,
  ) {
    const file = await em.findOne(EvidenceArtifact, parseId(id));
    if (!file) throw new ForbiddenException('Evidência não permitida.');
    let row: Inspection | ActionPlan;
    if (file.actionPlan)
      row = await this.actionAccess.load(
        actor,
        file.actionPlan.id,
        em,
        requestId,
        write,
        [],
        write,
      );
    else {
      try {
        row = await this.inspections.loadForEvidence(
          actor,
          file.inspection!.id,
          em,
          requestId,
          write,
        );
      } catch (error) {
        if (write || !(error instanceof ForbiddenException)) throw error;
        await this.actionAccess.sourceEvidence(
          actor,
          file.inspection!.id,
          file.questionId,
          file.id,
          em,
          requestId,
        );
        row = await em.findOneOrFail(Inspection, file.inspection!.id);
      }
    }
    if (write) await em.refresh(file, { lockMode: LockMode.PESSIMISTIC_WRITE });
    return { row, file };
  }
  private owner(actor: AuthenticatedPrincipal, file: EvidenceArtifact) {
    if (file.owner.id !== actor.userId)
      throw new ForbiddenException(
        'Somente quem preparou o envio pode transferir ou finalizar o arquivo.',
      );
  }
  async prepare(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parsePrepareFile(raw),
      metadata = validateMetadata(input, this.maxBytes);
    return this.entityManager.fork().transactional(async (em) => {
      const row = input.actionPlanId
        ? await this.actionAccess.load(actor, input.actionPlanId, em, requestId, true, [], true)
        : await this.inspections.loadForEvidence(actor, input.inspectionId!, em, requestId, true);
      if (!this.isEditable(row) || row.revision !== input.revision)
        throw new ConflictException('Inspeção alterada. Salve e revise antes de enviar.');
      if (input.uploadId) {
        const prior = await em.findOne(EvidenceArtifact, input.uploadId);
        if (prior) {
          if (
            prior.inspection?.id !== (row instanceof Inspection ? row.id : undefined) ||
            prior.actionPlan?.id !== (row instanceof ActionPlan ? row.id : undefined) ||
            prior.owner.id !== actor.userId ||
            prior.questionId !== input.questionId ||
            prior.filename !== metadata.filename ||
            prior.mime !== metadata.mime ||
            prior.size !== metadata.size ||
            prior.detachedAt ||
            prior.expiresAt <= this.now() ||
            !['PENDING', 'UPLOADED'].includes(prior.status)
          )
            throw new ConflictException('Identificador de envio já utilizado.');
          return {
            id: prior.id,
            expiresAt: prior.expiresAt.toISOString(),
            uploadPath: `files/${prior.id}/content`,
          };
        }
      }
      const file = new EvidenceArtifact();
      if (input.uploadId) file.id = input.uploadId;
      Object.assign(file, {
        filename: metadata.filename,
        mime: metadata.mime,
        size: metadata.size,
        inspection: row instanceof Inspection ? row : null,
        actionPlan: row instanceof ActionPlan ? row : null,
        owner: em.getReference(User, actor.userId),
        questionId: input.questionId,
        tempKey: `temporary/${randomUUID()}`,
        finalKey: `evidence/${randomUUID()}`,
        expiresAt: new Date(this.now().getTime() + 15 * 60000),
      });
      await this.editable(row, file, em);
      const existing = (await this.files(row, em)).filter(
        (file) => file.status === 'READY' || Date.parse(file.expiresAt!) > this.now().getTime(),
      );
      if (
        existing.length >= 20 ||
        existing.filter((file) => file.questionId === input.questionId).length >= 5
      )
        throw new BadRequestException(
          'Limite de evidências atingido: 5 por pergunta e 20 por inspeção.',
        );
      try {
        await this.storage.ensureBucket();
      } catch {
        throw new ServiceUnavailableException('Armazenamento indisponível. Tente novamente.');
      }
      em.persist(file);
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'evidence.prepared',
          resource: 'evidence',
          resourceId: file.id,
          requestId,
        },
        em,
      );
      return {
        id: file.id,
        expiresAt: file.expiresAt.toISOString(),
        uploadPath: `files/${file.id}/content`,
      };
    });
  }
  async upload(actor: AuthenticatedPrincipal, id: string, bytes: unknown, requestId: string) {
    if (!Buffer.isBuffer(bytes) || bytes.length > this.maxBytes)
      throw new BadRequestException('Envie o conteúdo binário dentro do limite informado.');
    return this.entityManager.fork().transactional(async (em) => {
      const { row, file } = await this.load(actor, id, em, requestId, true);
      this.owner(actor, file);
      await this.editable(row, file, em);
      if (file.expiresAt <= this.now())
        throw new ConflictException('O envio expirou. Prepare um novo arquivo.');
      const digest = validateContent(bytes, file);
      if (file.status === 'UPLOADED' && file.sha256 === digest) return { uploaded: true };
      if (file.status !== 'PENDING')
        throw new ConflictException('O conteúdo deste envio já está fixado.');
      try {
        await this.storage.put(file.tempKey, bytes, file.mime);
      } catch {
        throw new ServiceUnavailableException(
          'Não foi possível transferir o arquivo. Tente novamente.',
        );
      }
      file.sha256 = digest;
      file.status = 'UPLOADED';
      await em.flush();
      return { uploaded: true };
    });
  }
  async finalize(actor: AuthenticatedPrincipal, id: string, raw: unknown, requestId: string) {
    const input = parseFileRevision(raw);
    const receipt = await this.entityManager.fork().transactional(async (em) => {
      const { row, file } = await this.load(actor, id, em, requestId, true);
      this.owner(actor, file);
      if (
        file.status === 'READY' &&
        !file.detachedAt &&
        file.sourceRevision === input.revision &&
        row.revision === file.attachedRevision
      )
        return { revision: row.revision, files: await this.files(row, em) };
      await this.editable(row, file, em);
      if (
        file.status !== 'UPLOADED' ||
        file.expiresAt <= this.now() ||
        row.revision !== input.revision
      )
        throw new ConflictException('Envio ausente, expirado ou inspeção alterada.');
      try {
        const bytes = await this.storage.read(file.tempKey, this.maxBytes);
        if (validateContent(bytes, file) !== file.sha256)
          throw new Error('Evidence digest mismatch');
        await this.storage.copy(file.tempKey, file.finalKey);
        file.status = 'READY';
        file.sourceRevision = row.revision;
        row.revision++;
        file.attachedRevision = row.revision;
        await this.audit.record(
          {
            actorId: actor.userId,
            action: 'evidence.finalized',
            resource: 'evidence',
            resourceId: file.id,
            requestId,
            changes: { ...this.root(row), revision: row.revision },
          },
          em,
        );
      } catch {
        // Compensate while still holding the inspection lock. Both keys were persisted at prepare.
        await this.storage.remove(file.finalKey).catch(() => {});
        throw new ServiceUnavailableException(
          'Não foi possível finalizar a evidência. Tente novamente.',
        );
      }
      return { revision: row.revision, files: await this.files(row, em) };
    });
    // A failure here is recovered by the cleanup job; never remove a committed final object.
    const em = this.entityManager.fork(),
      file = await em.findOneOrFail(EvidenceArtifact, parseId(id));
    try {
      await this.storage.remove(file.tempKey);
      await em.nativeUpdate(
        EvidenceArtifact,
        { id: file.id, status: 'READY' },
        { tempCleaned: true },
      );
    } catch {
      /* durable cleanup intent remains in the row */
    }
    return receipt;
  }
  async detach(actor: AuthenticatedPrincipal, id: string, raw: unknown, requestId: string) {
    const input = parseFileRevision(raw);
    return this.entityManager.fork().transactional(async (em) => {
      const { row, file } = await this.load(actor, id, em, requestId, true);
      if (
        file.detachedAt &&
        file.sourceRevision === input.revision &&
        row.revision === file.attachedRevision
      )
        return { revision: row.revision, files: await this.files(row, em) };
      if (!this.isEditable(row) || row.revision !== input.revision)
        throw new ConflictException('Inspeção alterada. Recarregue antes de remover.');
      if (file.detachedAt) throw new ConflictException('Evidência já removida.');
      file.detachedAt = this.now();
      file.sourceRevision = row.revision;
      row.revision++;
      file.attachedRevision = row.revision;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'evidence.detached',
          resource: 'evidence',
          resourceId: file.id,
          requestId,
          changes: { revision: row.revision },
        },
        em,
      );
      return { revision: row.revision, files: await this.files(row, em) };
    });
  }
  async download(actor: AuthenticatedPrincipal, id: string, requestId: string) {
    const em = this.entityManager.fork(),
      { file } = await this.load(actor, id, em, requestId, false);
    if (file.status !== 'READY') throw new ConflictException('Evidência ainda não finalizada.');
    return {
      url: await this.storage.downloadUrl(file.finalKey, file.filename, file.mime),
      expiresInSeconds: 60,
    };
  }
  /** Only unfinalized expired objects are removed. READY final objects have indefinite retention. */
  async cleanup() {
    const em = this.entityManager.fork(),
      now = this.now();
    const candidates = await em.find(
      EvidenceArtifact,
      {
        $or: [
          { status: { $in: ['PENDING', 'UPLOADED'] }, expiresAt: { $lte: now } },
          { status: 'READY', tempCleaned: false },
        ],
      },
      {
        fields: ['id', 'inspection', 'actionPlan'],
        limit: 100,
        orderBy: { createdAt: 'asc', id: 'asc' },
      },
    );
    let cleaned = 0;
    for (const candidate of candidates) {
      await this.entityManager.fork().transactional(async (tx) => {
        if (candidate.actionPlan)
          await tx.findOneOrFail(ActionPlan, candidate.actionPlan.id, {
            lockMode: LockMode.PESSIMISTIC_WRITE,
          });
        else
          await tx.findOneOrFail(Inspection, candidate.inspection!.id, {
            lockMode: LockMode.PESSIMISTIC_WRITE,
          });
        const file = await tx.findOneOrFail(EvidenceArtifact, candidate.id, {
          lockMode: LockMode.PESSIMISTIC_WRITE,
        });
        if (file.status === 'READY') {
          if (!file.tempCleaned) {
            await this.storage.remove(file.tempKey);
            file.tempCleaned = true;
            cleaned++;
          }
        } else if (file.status !== 'CLEANED' && file.expiresAt <= now) {
          await this.storage.remove(file.tempKey);
          await this.storage.remove(file.finalKey);
          file.status = 'CLEANED';
          file.tempCleaned = true;
          cleaned++;
          await this.audit.record(
            {
              action: 'evidence.expired_cleaned',
              resource: 'evidence',
              resourceId: file.id,
              requestId: `cleanup-${file.id}`,
            },
            tx,
          );
        }
        await tx.flush();
      });
    }
    return { cleaned };
  }
}
