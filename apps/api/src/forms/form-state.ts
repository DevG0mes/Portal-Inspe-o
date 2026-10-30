import { ConflictException, NotFoundException } from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { FormTemplateSummary, FormVersionSummary, FormVersionView } from '@portal/contracts';
import { FormTemplate } from './entities/form-template.entity.js';
import type { FormVersion } from './entities/form-version.entity.js';

export const templateSummary = (template: FormTemplate): FormTemplateSummary => ({
  inspectionKind: template.inspectionKind,
  id: template.id,
  name: template.name,
  state: template.state,
  latestVersion: template.latestVersion,
  revision: template.revision,
  hasDraft: template.draftSnapshot !== null,
});
export const versionSummary = (
  version: Pick<FormVersion, 'id' | 'template' | 'number' | 'contentHash' | 'publishedAt'> & {
    publishedBy: { id: string; name: string };
  },
): FormVersionSummary => ({
  id: version.id,
  templateId: version.template.id,
  number: version.number,
  contentHash: version.contentHash,
  publishedAt: version.publishedAt.toISOString(),
  publishedById: version.publishedBy.id,
  publishedByName: version.publishedBy.name,
});
export const versionView = (version: FormVersion): FormVersionView => ({
  ...versionSummary(version),
  snapshot: version.snapshot,
});

export function checkRevision(template: FormTemplate, revision: number) {
  if (template.revision !== revision)
    throw new ConflictException('O formulário mudou. Recarregue antes de continuar.');
}

/** Read only after obtaining the row lock; waiting writers must see the committed revision. */
export async function lockEditableTemplate(em: EntityManager, id: string, revision: number) {
  const template = await em.findOne(FormTemplate, id, { lockMode: LockMode.PESSIMISTIC_WRITE });
  if (!template) throw new NotFoundException('Formulário não encontrado.');
  checkRevision(template, revision);
  if (template.state === 'ARCHIVED') throw new ConflictException('O formulário está arquivado.');
  return template;
}
