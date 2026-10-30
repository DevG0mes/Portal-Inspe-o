import { EntitySchema } from '@mikro-orm/core';
import { BaseEntity } from '../../database/base.entity.js';
import { Unit } from '../../organization/unit.entity.js';
import { FormTemplate } from './form-template.entity.js';
export class FormUnitBinding extends BaseEntity {
  form!: FormTemplate;
  unit!: Unit;
  isActive = true;
}
export const formUnitSchema = new EntitySchema<FormUnitBinding, BaseEntity>({
  class: FormUnitBinding,
  extends: BaseEntity,
  tableName: 'form_unit_binding',
  uniques: [{ properties: ['form', 'unit'] }],
  indexes: [{ properties: ['unit'] }],
  properties: {
    form: { kind: 'm:1', entity: () => FormTemplate, deleteRule: 'restrict' },
    unit: { kind: 'm:1', entity: () => Unit, deleteRule: 'restrict' },
    isActive: { type: 'boolean', default: true },
  },
});
