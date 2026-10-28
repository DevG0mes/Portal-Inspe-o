import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal } from '@portal/contracts';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { escapeLike, parseId, withUniqueConflict } from '../common/input.js';
import { FormTemplate } from './entities/form-template.entity.js';
import { FormVersion } from './entities/form-version.entity.js';
import {
  parseCreateForm,
  parseFormQuery,
  parsePreview,
  parseRevision,
  parseSaveDraft,
} from './dto/forms.dto.js';
import { checkRevision, lockEditableTemplate, templateSummary } from './form-state.js';
import { RuleEngine } from './rule-engine.service.js';
import { snapshotHash } from './snapshot.js';

export class FormTemplateService {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
    private readonly engine: RuleEngine,
  ) {}

  async list(actor: AuthenticatedPrincipal, raw: unknown) {
    const query = parseFormQuery(raw),
      em = this.entityManager.fork();
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const filter: FilterQuery<FormTemplate> = {
      ...(query.state ? { state: query.state } : {}),
      ...(query.q ? { nameKey: { $ilike: `%${escapeLike(query.q.toLowerCase())}%` } } : {}),
    };
    const [rows, total] = await em.findAndCount(
      FormTemplate,
      { $and: [user.role === 'ADMIN' ? {} : { state: 'PUBLISHED' }, filter] },
      {
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
        orderBy: { name: 'asc', id: 'asc' },
      },
    );
    return { data: rows.map(templateSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async get(actor: AuthenticatedPrincipal, rawId: string) {
    const id = parseId(rawId),
      em = this.entityManager.fork();
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    const template = await em.findOne(FormTemplate, {
      id,
      ...(user.role !== 'ADMIN' ? { state: 'PUBLISHED' as const } : {}),
    });
    if (!template) throw new ForbiddenException('Formulário não disponível.');
    return templateSummary(template);
  }

  async create(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseCreateForm(raw);
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        await this.access.assertAdministrator(actor, em);
        const template = new FormTemplate();
        template.name = input.name;
        template.nameKey = input.name.toLowerCase();
        template.draftSnapshot = { schemaVersion: 1, title: input.name, sections: [] };
        em.persist(template);
        await this.audit.record(
          {
            actorId: actor.userId,
            action: 'forms.created',
            resource: 'form',
            resourceId: template.id,
            requestId,
          },
          em,
        );
        return templateSummary(template);
      }),
    );
  }

  async getDraft(actor: AuthenticatedPrincipal, rawId: string) {
    const id = parseId(rawId),
      em = this.entityManager.fork();
    await this.access.assertAdministrator(actor, em);
    const template = await em.findOne(FormTemplate, id);
    if (!template?.draftSnapshot) throw new NotFoundException('Rascunho não encontrado.');
    return { revision: template.revision, snapshot: template.draftSnapshot };
  }

  async saveDraft(actor: AuthenticatedPrincipal, rawId: string, raw: unknown, requestId: string) {
    const id = parseId(rawId),
      input = parseSaveDraft(raw);
    return this.entityManager.fork().transactional(async (em) => {
      await this.access.assertAdministrator(actor, em);
      const template = await lockEditableTemplate(em, id, input.revision);
      if (!template.draftSnapshot)
        throw new ConflictException('Crie um novo rascunho antes de editar.');
      template.draftSnapshot = input.snapshot;
      template.revision++;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'forms.draft_saved',
          resource: 'form',
          resourceId: id,
          requestId,
          changes: { revision: template.revision, contentHash: snapshotHash(input.snapshot) },
        },
        em,
      );
      return { revision: template.revision, snapshot: template.draftSnapshot };
    });
  }

  async createDraft(actor: AuthenticatedPrincipal, rawId: string, raw: unknown, requestId: string) {
    const id = parseId(rawId),
      input = parseRevision(raw);
    return this.entityManager.fork().transactional(async (em) => {
      await this.access.assertAdministrator(actor, em);
      const template = await lockEditableTemplate(em, id, input.revision);
      if (template.draftSnapshot) throw new ConflictException('Já existe um rascunho.');
      const previous = await em.findOne(FormVersion, {
        template: id,
        number: template.latestVersion,
      });
      if (!previous) throw new NotFoundException('Versão publicada não encontrada.');
      template.draftSnapshot = structuredClone(previous.snapshot);
      template.revision++;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'forms.draft_created',
          resource: 'form',
          resourceId: id,
          requestId,
          changes: { revision: template.revision, basedOn: previous.number },
        },
        em,
      );
      return { revision: template.revision, snapshot: template.draftSnapshot };
    });
  }

  async preview(actor: AuthenticatedPrincipal, rawId: string, raw: unknown) {
    const id = parseId(rawId),
      input = parsePreview(raw),
      em = this.entityManager.fork();
    await this.access.assertAdministrator(actor, em);
    const template = await em.findOne(FormTemplate, id);
    if (!template?.draftSnapshot) throw new NotFoundException('Rascunho não encontrado.');
    checkRevision(template, input.revision);
    return {
      revision: template.revision,
      result: this.engine.evaluate(template.draftSnapshot, input.answers),
    };
  }

  async archive(actor: AuthenticatedPrincipal, rawId: string, raw: unknown, requestId: string) {
    const id = parseId(rawId),
      input = parseRevision(raw);
    return this.entityManager.fork().transactional(async (em) => {
      await this.access.assertAdministrator(actor, em);
      const template = await lockEditableTemplate(em, id, input.revision);
      template.state = 'ARCHIVED';
      template.revision++;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'forms.archived',
          resource: 'form',
          resourceId: id,
          requestId,
          changes: { revision: template.revision, latestVersion: template.latestVersion },
        },
        em,
      );
      return templateSummary(template);
    });
  }
}
