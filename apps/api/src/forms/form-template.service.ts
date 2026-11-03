import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { importQuestions } from '@portal/form-engine';
import { LockMode } from '@mikro-orm/core';
import { Unit } from '../organization/unit.entity.js';
import { User } from '../identity/user.entity.js';
import { FormUnitBinding } from './entities/form-unit.entity.js';
import { INSPECTION_KINDS } from '@portal/contracts';
import type { FilterQuery } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { AuthenticatedPrincipal } from '@portal/contracts';
import { AccessPolicy } from '../access/access-policy.service.js';
import { AuditService } from '../audit/audit.service.js';
import { escapeLike, parseId, withUniqueConflict } from '../common/input.js';
import { FormTemplate } from './entities/form-template.entity.js';
import { FormVersion } from './entities/form-version.entity.js';
import { Sector } from '../organization/sector.entity.js';
import { InspectionSchedule } from '../schedules/schedule.entity.js';
import {
  parseCreateForm,
  parseTypeBinding,
  parseImportForm,
  parseFormQuery,
  parsePreview,
  parseRevision,
  parseSaveDraft,
} from './dto/forms.dto.js';
import { checkRevision, lockEditableTemplate, templateSummary } from './form-state.js';
import { RuleEngine } from './rule-engine.service.js';
import { snapshotHash } from './snapshot.js';

export class FormTemplateService {
  private async activeType(em: EntityManager, id: string) {
    const type = await em.findOne(
      Sector,
      { id, isActive: true, unit: { isActive: true } },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!type) throw new BadRequestException('Selecione um tipo de inspeção ativo.');
    return type;
  }

  async bindType(actor: AuthenticatedPrincipal, rawId: string, raw: unknown, requestId: string) {
    const input = parseTypeBinding(raw),
      id = parseId(rawId);
    return this.entityManager.fork().transactional(async (em) => {
      await em.findOne(User, actor.userId, { lockMode: LockMode.PESSIMISTIC_READ, refresh: true });
      await this.access.assertAdministrator(actor, em);
      const type = await this.activeType(em, input.inspectionTypeId);
      const row = await lockEditableTemplate(em, id, input.revision);
      // Changing a live schedule's type would silently change its operational meaning.
      if (await em.count(InspectionSchedule, { form: id }))
        throw new ConflictException(
          'Este formulário possui programação. Crie um modelo separado para outro tipo.',
        );
      row.inspectionType = type;
      row.revision++;
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'forms.type_bound',
          resource: 'form',
          resourceId: id,
          requestId,
          changes: { inspectionTypeId: type.id },
        },
        em,
      );
      return templateSummary(row);
    });
  }

  async remove(actor: AuthenticatedPrincipal, rawId: string, raw: unknown, requestId: string) {
    const id = parseId(rawId),
      input = parseRevision(raw);
    return this.entityManager.fork().transactional(async (em) => {
      await em.findOne(User, actor.userId, { lockMode: LockMode.PESSIMISTIC_READ, refresh: true });
      await this.access.assertAdministrator(actor, em);
      const row = await em.findOne(FormTemplate, id, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!row || row.deletedAt) throw new NotFoundException('Formulário não encontrado.');
      checkRevision(row, input.revision);
      const physical =
        !row.latestVersion &&
        !(await em.count(FormVersion, { template: id })) &&
        !(await em.count(InspectionSchedule, { form: id }));
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'forms.removed',
          resource: 'form',
          resourceId: id,
          requestId,
          changes: { name: row.name, physical },
        },
        em,
      );
      if (physical) {
        await em.nativeDelete(FormUnitBinding, { form: id });
        em.remove(row);
      } else {
        row.deletedAt = new Date();
        row.state = 'ARCHIVED';
        row.nameKey = `${row.nameKey}:removed:${row.id}`;
        row.revision++;
      }
      return { removed: true, historyPreserved: !physical };
    });
  }
  constructor(
    private readonly entityManager: EntityManager,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
    private readonly engine: RuleEngine,
  ) {}

  async importCsv(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseImportForm(raw);
    const { importId, ...content } = input;
    const hash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        // One transaction/connection; serialize the client request key across administrators.
        await em.execute('select pg_advisory_xact_lock(hashtextextended(?,0))', [importId]);
        await em.findOne(User, actor.userId, {
          lockMode: LockMode.PESSIMISTIC_READ,
          refresh: true,
        });
        await this.access.assertAdministrator(actor, em);
        const previous = await em.findOne(FormTemplate, importId);
        if (previous) {
          if (previous.deletedAt)
            throw new ConflictException(
              'Este pedido pertence a um formulário removido. Prepare uma nova importação.',
            );
          if (previous.importHash !== hash)
            throw new ConflictException(
              'Este pedido de importação já foi usado com outro conteúdo.',
            );
          return templateSummary(previous);
        }
        const units = await em.find(
          Unit,
          { id: { $in: input.unitIds }, isActive: true },
          { lockMode: LockMode.PESSIMISTIC_READ, orderBy: { id: 'asc' }, refresh: true },
        );
        if (units.length !== input.unitIds.length)
          throw new BadRequestException('Selecione unidades ativas para este modelo.');
        const type = input.inspectionTypeId
          ? await this.activeType(em, input.inspectionTypeId)
          : null;
        if (type && (units.length !== 1 || units[0]!.id !== type.unit.id))
          throw new BadRequestException('O tipo precisa pertencer à unidade selecionada.');
        let snapshot;
        try {
          snapshot = importQuestions(input.headers, { ...input, title: input.name }, randomUUID);
        } catch (error) {
          throw new BadRequestException(
            error instanceof Error ? error.message : 'Cabeçalho inválido.',
          );
        }
        if (this.engine.validateDefinition(snapshot).length)
          throw new BadRequestException('O modelo importado contém referências inválidas.');
        const template = new FormTemplate();
        Object.assign(template, {
          id: importId,
          name: input.name,
          nameKey: input.name.toLowerCase(),
          draftSnapshot: snapshot,
          importHash: hash,
          inspectionKind: input.inspectionKind,
          inspectionType: type,
        });
        em.persist(template);
        for (const unit of units) {
          const binding = new FormUnitBinding();
          Object.assign(binding, { unit, form: template });
          em.persist(binding);
        }
        await this.audit.record(
          {
            actorId: actor.userId,
            action: 'forms.imported',
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

  async availableKinds(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const q = parseFormQuery(raw),
      em = this.entityManager.fork();
    if (!q.unitId) throw new BadRequestException('Selecione uma unidade.');
    const scope = await this.access.unitFilter(actor, requestId, em);
    const unit = await em.findOne(Unit, { $and: [{ id: q.unitId, isActive: true }, scope] });
    if (!unit) throw new ForbiddenException('Unidade não disponível.');
    const links = await em.find(
      FormUnitBinding,
      { unit: unit.id, isActive: true },
      { fields: ['form'] },
    );
    const forms = await em.find(
      FormTemplate,
      { id: { $in: links.map((l) => l.form.id) }, state: 'PUBLISHED' },
      { fields: ['id', 'inspectionKind'] },
    );
    return {
      configured: links.length > 0,
      types: INSPECTION_KINDS.map((kind) => {
        const matches = forms.filter((f) => f.inspectionKind === kind);
        return {
          kind,
          count: matches.length,
          formId: matches.length === 1 ? matches[0]!.id : null,
        };
      }),
    };
  }

  async list(actor: AuthenticatedPrincipal, raw: unknown, requestId: string = randomUUID()) {
    const query = parseFormQuery(raw),
      em = this.entityManager.fork();
    const user = await this.access.requireRoles(actor, ['ADMIN', 'MANAGER', 'COLLABORATOR'], em);
    let eligibility: FilterQuery<FormTemplate> = {};
    if (query.unitId || user.role !== 'ADMIN') {
      const scope = await this.access.unitFilter(actor, requestId, em);
      const units = await em.find(
        Unit,
        { $and: [scope, { isActive: true }, query.unitId ? { id: query.unitId } : {}] },
        { fields: ['id'] },
      );
      const links = await em.find(
        FormUnitBinding,
        { isActive: true, unit: { $in: units.map((u) => u.id) } },
        { fields: ['form'] },
      );
      eligibility =
        query.unitId && !units.length
          ? { id: { $in: [] } }
          : {
              $or: [
                { inspectionKind: null, inspectionType: null },
                { inspectionType: { unit: { $in: units.map((u) => u.id) } } },
                { id: { $in: links.map((l) => l.form.id) } },
              ],
            };
    }
    const filter: FilterQuery<FormTemplate> = {
      deletedAt: null,
      ...(query.inspectionTypeId
        ? {
            $or: [{ inspectionType: query.inspectionTypeId }, { inspectionType: null }],
          }
        : {}),
      ...(query.state ? { state: query.state } : {}),
      ...(query.inspectionKind ? { inspectionKind: query.inspectionKind } : {}),
      ...(query.q ? { nameKey: { $ilike: `%${escapeLike(query.q.toLowerCase())}%` } } : {}),
    };
    const [rows, total] = await em.findAndCount(
      FormTemplate,
      { $and: [user.role === 'ADMIN' ? {} : { state: 'PUBLISHED' }, filter, eligibility] },
      {
        limit: query.pageSize,
        populate: ['inspectionType'],
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
    const template = await em.findOne(
      FormTemplate,
      {
        id,
        deletedAt: null,
        ...(user.role !== 'ADMIN' ? { state: 'PUBLISHED' as const } : {}),
      },
      { populate: ['inspectionType'] },
    );
    if (!template) throw new ForbiddenException('Formulário não disponível.');
    return templateSummary(template);
  }

  async create(actor: AuthenticatedPrincipal, raw: unknown, requestId: string) {
    const input = parseCreateForm(raw);
    return withUniqueConflict(() =>
      this.entityManager.fork().transactional(async (em) => {
        await this.access.assertAdministrator(actor, em);
        const template = new FormTemplate();
        template.inspectionType = input.inspectionTypeId
          ? await this.activeType(em, input.inspectionTypeId)
          : null;
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
    if (!template?.draftSnapshot || template.deletedAt)
      throw new NotFoundException('Rascunho não encontrado.');
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
    if (!template?.draftSnapshot || template.deletedAt)
      throw new NotFoundException('Rascunho não encontrado.');
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
