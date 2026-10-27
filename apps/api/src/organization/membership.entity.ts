import { EntitySchema } from '@mikro-orm/core';
import { BaseEntity } from '../database/base.entity.js';
import { User } from '../identity/user.entity.js';
import { Unit } from './unit.entity.js';
import { Sector } from './sector.entity.js';

/** A unit grant never implicitly grants all sectors inside that unit. */
export class UnitMembership extends BaseEntity {
  user!: User;
  unit!: Unit;
  isActive = true;
}

export class SectorMembership extends BaseEntity {
  unitMembership!: UnitMembership;
  sector!: Sector;
  isActive = true;
}

export const unitMembershipSchema = new EntitySchema<UnitMembership, BaseEntity>({
  class: UnitMembership,
  extends: BaseEntity,
  tableName: 'unit_membership',
  properties: {
    user: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    unit: { kind: 'm:1', entity: () => Unit, deleteRule: 'restrict' },
    isActive: { type: 'boolean', default: true },
  },
  uniques: [{ properties: ['user', 'unit'] }],
  indexes: [{ properties: ['unit'] }],
});

export const sectorMembershipSchema = new EntitySchema<SectorMembership, BaseEntity>({
  class: SectorMembership,
  extends: BaseEntity,
  tableName: 'sector_membership',
  properties: {
    unitMembership: { kind: 'm:1', entity: () => UnitMembership, deleteRule: 'restrict' },
    sector: { kind: 'm:1', entity: () => Sector, deleteRule: 'restrict' },
    isActive: { type: 'boolean', default: true },
  },
  uniques: [{ properties: ['unitMembership', 'sector'] }],
  indexes: [{ properties: ['sector'] }],
});
