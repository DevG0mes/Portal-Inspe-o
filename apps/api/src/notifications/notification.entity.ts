import { EntitySchema } from '@mikro-orm/core';
import type { NotificationKind } from '@portal/contracts';
import { BaseEntity } from '../database/base.entity.js';
import { User } from '../identity/user.entity.js';
export class Notification extends BaseEntity {
  recipient!: User;
  eventKey!: string;
  kind!: NotificationKind;
  resourceType!: 'ACTION_PLAN' | 'ASSIGNMENT';
  resourceId!: string;
  readAt: Date | null = null;
}
export const notificationSchema = new EntitySchema<Notification, BaseEntity>({
  class: Notification,
  extends: BaseEntity,
  tableName: 'notification',
  properties: {
    recipient: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    eventKey: { type: 'string', length: 240 },
    kind: { type: 'string', length: 40 },
    resourceType: { type: 'string', length: 20 },
    resourceId: { type: 'uuid' },
    readAt: { type: 'datetime', columnType: 'timestamptz', nullable: true },
  },
  uniques: [{ properties: ['recipient', 'eventKey'] }],
  indexes: [{ properties: ['recipient', 'readAt', 'createdAt'] }],
});
