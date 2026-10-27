import { Collection, EntitySchema } from '@mikro-orm/core';
import { BaseEntity } from '../database/base.entity.js';
import { Unit } from './unit.entity.js';
import { SectorMembership } from './membership.entity.js';

export class Sector extends BaseEntity {
  unit!: Unit;
  name!: string;
  nameKey!: string;
  isActive = true;
  memberships = new Collection<SectorMembership>(this);
}

export const sectorSchema = new EntitySchema<Sector, BaseEntity>({
  class: Sector,
  extends: BaseEntity,
  tableName: 'organization_sector',
  properties: {
    unit: { kind: 'm:1', entity: () => Unit, deleteRule: 'restrict' },
    name: { type: 'string', length: 160 },
    nameKey: { type: 'string', length: 160, hidden: true },
    isActive: { type: 'boolean', default: true },
    memberships: { kind: '1:m', entity: () => SectorMembership, mappedBy: 'sector' },
  },
  uniques: [{ properties: ['unit', 'nameKey'] }],
});
