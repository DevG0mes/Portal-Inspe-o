import { EntitySchema } from '@mikro-orm/core';
import { BaseEntity } from '../database/base.entity.js';
import { User } from './user.entity.js';

export class Session extends BaseEntity {
  user!: User;
  tokenHash!: string;
  expiresAt!: Date;
  revokedAt: Date | null = null;
}

export const sessionSchema = new EntitySchema<Session, BaseEntity>({
  class: Session,
  extends: BaseEntity,
  tableName: 'auth_session',
  properties: {
    user: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    tokenHash: { type: 'string', length: 64, unique: true, hidden: true },
    expiresAt: { type: 'datetime', columnType: 'timestamptz' },
    revokedAt: { type: 'datetime', columnType: 'timestamptz', nullable: true },
  },
  indexes: [{ properties: ['user', 'revokedAt'] }, { properties: ['expiresAt'] }],
});
