import { EntitySchema } from '@mikro-orm/core';
import type { FormVersionSnapshot } from '@portal/contracts';
import { BaseEntity } from '../../database/base.entity.js';
import { User } from '../../identity/user.entity.js';
import { FormTemplate } from './form-template.entity.js';

/** A published snapshot is append-only; PostgreSQL rejects updates, deletes and truncate. */
export class FormVersion extends BaseEntity {
  template!: FormTemplate;
  number!: number;
  snapshot!: FormVersionSnapshot;
  contentHash!: string;
  publishedBy!: User;
  publishedAt = new Date();
}

export const formVersionSchema = new EntitySchema<FormVersion, BaseEntity>({
  class: FormVersion,
  extends: BaseEntity,
  tableName: 'form_version',
  properties: {
    template: { kind: 'm:1', entity: () => FormTemplate, deleteRule: 'restrict' },
    number: { type: 'integer' },
    snapshot: { type: 'json', columnType: 'jsonb' },
    contentHash: { type: 'string', length: 64 },
    publishedBy: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    publishedAt: { type: 'datetime', columnType: 'timestamptz' },
  },
  uniques: [{ properties: ['template', 'number'] }],
  indexes: [{ properties: ['publishedBy'] }],
});
