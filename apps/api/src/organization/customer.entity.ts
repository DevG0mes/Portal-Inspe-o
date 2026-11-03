import { Collection, EntitySchema } from '@mikro-orm/core';
import { BaseEntity } from '../database/base.entity.js';
import { Unit } from './unit.entity.js';
export class Customer extends BaseEntity {
  name!: string;
  nameKey!: string;
  isActive = true;
  revision = 1;
  unitLinks = new Collection<CustomerUnit>(this);
}
export class CustomerUnit extends BaseEntity {
  customer!: Customer;
  unit!: Unit;
  isActive = true;
}
export class CustomerLocation extends BaseEntity {
  city?: string;
  customer?: Customer;
  name!: string;
  nameKey!: string;
  isActive = true;
  revision = 1;
}
export const customerSchema = new EntitySchema<Customer, BaseEntity>({
  class: Customer,
  extends: BaseEntity,
  tableName: 'inspection_customer',
  properties: {
    name: { type: 'string', length: 160 },
    nameKey: { type: 'text', unique: true, hidden: true },
    isActive: { type: 'boolean', default: true },
    revision: { type: 'integer', default: 1 },
    unitLinks: { kind: '1:m', entity: () => CustomerUnit, mappedBy: 'customer' },
  },
});
export const customerUnitSchema = new EntitySchema<CustomerUnit, BaseEntity>({
  class: CustomerUnit,
  extends: BaseEntity,
  tableName: 'customer_unit',
  uniques: [{ properties: ['customer', 'unit'] }],
  indexes: [{ name: 'customer_unit_scope_idx', properties: ['unit', 'isActive'] }],
  properties: {
    customer: { kind: 'm:1', entity: () => Customer, deleteRule: 'restrict' },
    unit: { kind: 'm:1', entity: () => Unit, deleteRule: 'restrict' },
    isActive: { type: 'boolean', default: true },
  },
});
export const customerLocationSchema = new EntitySchema<CustomerLocation, BaseEntity>({
  class: CustomerLocation,
  extends: BaseEntity,
  tableName: 'customer_location',
  uniques: [{ properties: ['customer', 'nameKey'] }],
  properties: {
    customer: { kind: 'm:1', entity: () => Customer, deleteRule: 'restrict', nullable: true },
    name: { type: 'string', length: 320 },
    city: { type: 'string', length: 160, nullable: true },
    nameKey: { type: 'text', hidden: true },
    isActive: { type: 'boolean', default: true },
    revision: { type: 'integer', default: 1 },
  },
});
