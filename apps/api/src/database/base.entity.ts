import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';

/** Shared identity and UTC instants; domain entities retain their own lifecycle rules. */
export abstract class BaseEntity {
  id: string = randomUUID();
  createdAt = new Date();
  updatedAt = new Date(this.createdAt);
}

export const baseEntitySchema = new EntitySchema<BaseEntity>({
  class: BaseEntity,
  abstract: true,
  properties: {
    id: { type: 'uuid', primary: true },
    createdAt: { type: 'datetime', columnType: 'timestamptz' },
    updatedAt: { type: 'datetime', columnType: 'timestamptz', onUpdate: () => new Date() },
  },
});
