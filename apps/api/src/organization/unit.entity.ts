import { Collection, EntitySchema } from '@mikro-orm/core';
import { BaseEntity } from '../database/base.entity.js';
import { UnitMembership } from './membership.entity.js';

export class Unit extends BaseEntity {
  name!: string;
  nameKey!: string;
  isActive = true;
  memberships = new Collection<UnitMembership>(this);
}

export const unitSchema = new EntitySchema<Unit, BaseEntity>({
  class: Unit,
  extends: BaseEntity,
  tableName: 'organization_unit',
  properties: {
    name: { type: 'string', length: 160 },
    nameKey: { type: 'string', length: 160, unique: true, hidden: true },
    isActive: { type: 'boolean', default: true },
    memberships: { kind: '1:m', entity: () => UnitMembership, mappedBy: 'unit' },
  },
});
