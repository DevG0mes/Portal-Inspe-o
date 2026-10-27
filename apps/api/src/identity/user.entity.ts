import { EntitySchema } from '@mikro-orm/core';
import { USER_ROLES, type UserRole } from '@portal/contracts';
import { BaseEntity } from '../database/base.entity.js';

export class User extends BaseEntity {
  email!: string;
  name!: string;
  passwordHash!: string;
  role: UserRole = 'COLLABORATOR';
  isActive = true;
  mustChangePassword = true;
  failedLoginAttempts = 0;
  lockedUntil: Date | null = null;
}

export const userSchema = new EntitySchema<User, BaseEntity>({
  class: User,
  extends: BaseEntity,
  tableName: 'portal_user',
  properties: {
    email: { type: 'string', length: 254, unique: true },
    name: { type: 'string', length: 160 },
    passwordHash: { type: 'string', length: 255, hidden: true },
    role: { enum: true, items: () => USER_ROLES, default: 'COLLABORATOR' },
    isActive: { type: 'boolean', default: true },
    mustChangePassword: { type: 'boolean', default: true },
    failedLoginAttempts: { type: 'integer', default: 0, hidden: true },
    lockedUntil: { type: 'datetime', columnType: 'timestamptz', nullable: true, hidden: true },
  },
});
