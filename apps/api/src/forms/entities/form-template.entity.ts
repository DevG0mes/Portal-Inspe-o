import { EntitySchema } from '@mikro-orm/core';
import { FORM_STATES, type FormState, type FormVersionSnapshot } from '@portal/contracts';
import { BaseEntity } from '../../database/base.entity.js';

export class FormTemplate extends BaseEntity {
  name!: string;
  nameKey!: string;
  state: FormState = 'DRAFT';
  revision = 1;
  latestVersion = 0;
  draftSnapshot: FormVersionSnapshot | null = null;
}

export const formTemplateSchema = new EntitySchema<FormTemplate, BaseEntity>({
  class: FormTemplate,
  extends: BaseEntity,
  tableName: 'form_template',
  properties: {
    name: { type: 'string', length: 160 },
    nameKey: { type: 'text', unique: true, hidden: true },
    state: { enum: true, items: () => FORM_STATES, default: 'DRAFT' },
    revision: { type: 'integer', default: 1 },
    latestVersion: { type: 'integer', default: 0 },
    draftSnapshot: { type: 'json', columnType: 'jsonb', nullable: true, hidden: true },
  },
});
