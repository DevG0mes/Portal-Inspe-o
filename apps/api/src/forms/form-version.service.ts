import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal } from '@portal/contracts';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { paginationShape, parseId, parseInput, withUniqueConflict } from '../common/input.js';
import { z } from 'zod';
import { User } from '../identity/user.entity.js';
import { FormVersion } from './entities/form-version.entity.js';
import { parseRevision, parseVersionNumber } from './dto/forms.dto.js';
import { lockEditableTemplate, versionSummary, versionView } from './form-state.js';
import { RuleEngine } from './rule-engine.service.js';
import { snapshotHash } from './snapshot.js';

export class FormVersionService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
    private readonly engine: RuleEngine,
  ) {}

  async publish(actor: AuthenticatedPrincipal, rawId: string, raw: unknown, requestId: string) {
    const id = parseId(rawId),
      input = parseRevision(raw);
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        await this.access.assertAdministrator(actor, em);
        const template = await lockEditableTemplate(em, id, input.revision);
        if (!template.draftSnapshot) throw new ConflictException('Não há rascunho para publicar.');
        const definitionErrors = this.engine.validateDefinition(template.draftSnapshot);
        if (definitionErrors.length)
          throw new BadRequestException({
            message: 'Revise o formulário antes de publicar.',
            definitionErrors,
          });
        const version = new FormVersion();
        version.template = template;
        version.number = template.latestVersion + 1;
        version.snapshot = structuredClone(template.draftSnapshot);
        version.contentHash = snapshotHash(version.snapshot);
        version.publishedBy = em.getReference(User, actor.userId);
        em.persist(version);
        template.latestVersion = version.number;
        template.state = 'PUBLISHED';
        template.draftSnapshot = null;
        template.revision++;
        await this.audit.record(
          {
            actorId: actor.userId,
            action: 'forms.published',
            resource: 'form',
            resourceId: id,
            requestId,
            changes: {
              versionId: version.id,
              number: version.number,
              contentHash: version.contentHash,
            },
          },
          em,
        );
        await em.populate(version, ['publishedBy']);
        return versionView(version);
      }),
    );
  }

  async get(actor: AuthenticatedPrincipal, rawId: string, rawNumber: string) {
    const id = parseId(rawId),
      number = parseVersionNumber(rawNumber),
      em = this.entityManager.fork();
    await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const version = await em.findOne(
      FormVersion,
      { template: id, number },
      { populate: ['publishedBy'] },
    );
    if (!version) throw new NotFoundException('Versão publicada não encontrada.');
    return versionView(version);
  }

  async list(actor: AuthenticatedPrincipal, rawId: string, raw: unknown) {
    const id = parseId(rawId),
      query = parseInput(z.object(paginationShape).strict(), raw),
      em = this.entityManager.fork();
    await this.access.assertAdministrator(actor, em);
    const [versions, total] = await em.findAndCount(
      FormVersion,
      { template: id },
      {
        orderBy: { number: 'desc' },
        fields: [
          'id',
          'template',
          'number',
          'contentHash',
          'publishedAt',
          'publishedBy.id',
          'publishedBy.name',
        ],
        populate: ['publishedBy'],
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      },
    );
    return {
      data: versions.map(versionSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
