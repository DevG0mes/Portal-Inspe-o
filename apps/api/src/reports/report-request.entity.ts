import { EntitySchema } from '@mikro-orm/core';
import type { ReportSnapshot, ReportState, ReportFormat, ReportError } from '@portal/contracts';
import { BaseEntity } from '../database/base.entity.js';
import { User } from '../identity/user.entity.js';
export class ReportRequest extends BaseEntity {
  requestedBy!: User;
  requestId!: string;
  requestHash!: string;
  format!: ReportFormat;
  state: ReportState = 'QUEUED';
  snapshot: ReportSnapshot | null = null;
  attempts = 0;
  leaseUntil: Date | null = null;
  objectKey: string | null = null;
  size: number | null = null;
  sha256: string | null = null;
  completedAt: Date | null = null;
  errorCode: ReportError | null = null;
  artifactKeys: string[] = [];
  cleanupAt: Date | null = null;
}
export const reportRequestSchema = new EntitySchema<ReportRequest, BaseEntity>({
  class: ReportRequest,
  extends: BaseEntity,
  tableName: 'report_request',
  properties: {
    requestedBy: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    requestId: { type: 'uuid' },
    requestHash: { type: 'string', length: 64 },
    format: { enum: true, items: () => ['PDF', 'XLSX'] },
    state: {
      enum: true,
      items: () => ['QUEUED', 'PROCESSING', 'READY', 'FAILED'],
      default: 'QUEUED',
    },
    snapshot: { type: 'json', columnType: 'jsonb', nullable: true },
    attempts: { type: 'integer', default: 0 },
    leaseUntil: { type: 'datetime', columnType: 'timestamptz', nullable: true },
    objectKey: { type: 'string', length: 240, nullable: true },
    size: { type: 'integer', nullable: true },
    sha256: { type: 'string', length: 64, nullable: true },
    completedAt: { type: 'datetime', columnType: 'timestamptz', nullable: true },
    errorCode: { type: 'string', length: 40, nullable: true },
    artifactKeys: { type: 'json', columnType: 'jsonb' },
    cleanupAt: { type: 'datetime', columnType: 'timestamptz', nullable: true },
  },
  uniques: [{ properties: ['requestedBy', 'requestId'] }],
  indexes: [
    { properties: ['requestedBy', 'createdAt'] },
    { properties: ['state', 'leaseUntil'] },
    { properties: ['cleanupAt'] },
  ],
});
