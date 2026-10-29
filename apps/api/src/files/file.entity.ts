import { EntitySchema } from '@mikro-orm/core';
import type { EvidenceFile } from '@portal/contracts';
import { BaseEntity } from '../database/base.entity.js';
import { User } from '../identity/user.entity.js';
import { Inspection } from '../inspections/inspection.entity.js';
import { ActionPlan } from '../action-plans/action-plan.entity.js';
export class EvidenceArtifact extends BaseEntity {
  inspection: Inspection | null = null;
  actionPlan: ActionPlan | null = null;
  owner!: User;
  questionId!: string;
  filename!: string;
  mime!: string;
  size!: number;
  sha256: string | null = null;
  status: 'PENDING' | 'UPLOADED' | 'READY' | 'CLEANED' = 'PENDING';
  tempKey!: string;
  finalKey!: string;
  tempCleaned = false;
  expiresAt!: Date;
  detachedAt: Date | null = null;
  sourceRevision: number | null = null;
  attachedRevision: number | null = null;
}
export function evidenceView(file: EvidenceArtifact): EvidenceFile {
  if (file.status === 'CLEANED') throw new Error('Cleaned artifacts are not public evidence');
  return {
    id: file.id,
    questionId: file.questionId,
    filename: file.filename,
    mime: file.mime,
    size: file.size,
    sha256: file.sha256,
    status: file.status,
    expiresAt: file.status === 'READY' ? null : file.expiresAt.toISOString(),
  };
}
export const evidenceArtifactSchema = new EntitySchema<EvidenceArtifact, BaseEntity>({
  class: EvidenceArtifact,
  extends: BaseEntity,
  tableName: 'evidence_artifact',
  checks: [
    {
      name: 'evidence_artifact_owner_check',
      expression: '(inspection_id is null) <> (action_plan_id is null)',
    },
  ],
  properties: {
    inspection: { kind: 'm:1', entity: () => Inspection, deleteRule: 'restrict', nullable: true },
    actionPlan: { kind: 'm:1', entity: () => ActionPlan, deleteRule: 'restrict', nullable: true },
    owner: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    questionId: { type: 'uuid' },
    filename: { type: 'string', length: 160 },
    mime: { type: 'string', length: 80 },
    size: { type: 'integer' },
    sha256: { type: 'string', length: 64, nullable: true },
    status: {
      enum: true,
      items: () => ['PENDING', 'UPLOADED', 'READY', 'CLEANED'],
      default: 'PENDING',
    },
    tempKey: { type: 'string', length: 200, unique: true },
    finalKey: { type: 'string', length: 200, unique: true },
    tempCleaned: { type: 'boolean', default: false },
    expiresAt: { type: 'datetime', columnType: 'timestamptz' },
    detachedAt: { type: 'datetime', columnType: 'timestamptz', nullable: true },
    sourceRevision: { type: 'integer', nullable: true },
    attachedRevision: { type: 'integer', nullable: true },
  },
  indexes: [
    { properties: ['inspection'] },
    { properties: ['actionPlan'] },
    { properties: ['owner'] },
    { properties: ['status', 'expiresAt'] },
  ],
});
