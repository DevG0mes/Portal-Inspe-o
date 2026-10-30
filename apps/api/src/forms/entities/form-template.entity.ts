import { EntitySchema } from '@mikro-orm/core';
import {
  FORM_STATES,
  INSPECTION_KINDS,
  type InspectionKind,
  type FormState,
  type FormVersionSnapshot,
} from '@portal/contracts';
import { BaseEntity } from '../../database/base.entity.js';

export class FormTemplate extends BaseEntity {
  importHash: string | null = null;
  inspectionKind: InspectionKind | null = null;
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
    importHash: { type: 'string', length: 64, nullable: true, hidden: true },
    inspectionKind: { enum: true, items: () => INSPECTION_KINDS, nullable: true },
    name: { type: 'string', length: 160 },
    nameKey: { type: 'text', unique: true, hidden: true },
    state: { enum: true, items: () => FORM_STATES, default: 'DRAFT' },
    revision: { type: 'integer', default: 1 },
    latestVersion: { type: 'integer', default: 0 },
    draftSnapshot: { type: 'json', columnType: 'jsonb', nullable: true, hidden: true },
  },
});
