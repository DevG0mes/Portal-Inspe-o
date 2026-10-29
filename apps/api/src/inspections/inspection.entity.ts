import { EntitySchema } from '@mikro-orm/core';
import type {
  AnswerInput,
  NonconformityOccurrence,
  InspectionNote,
  EvidenceFile,
} from '@portal/contracts';
import { BaseEntity } from '../database/base.entity.js';
import { User } from '../identity/user.entity.js';
import { Unit } from '../organization/unit.entity.js';
import { Sector } from '../organization/sector.entity.js';
import { FormVersion } from '../forms/entities/form-version.entity.js';
import { InspectionAssignment } from '../schedules/schedule.entity.js';

export class Inspection extends BaseEntity {
  unit!: Unit;
  sector!: Sector;
  assignment: InspectionAssignment | null = null;
  createdBy!: User;
  formVersion!: FormVersion;
  state: 'DRAFT' | 'COMPLETED' = 'DRAFT';
  revision = 1;
  cycle = 1;
  answers: AnswerInput[] = [];
  notes: InspectionNote[] = [];
}
/** Each completion is append-only. Reopening creates another cycle, never edits this row. */
export class InspectionSubmission extends BaseEntity {
  inspection!: Inspection;
  cycle!: number;
  sourceRevision!: number;
  completedAt = new Date();
  completedBy!: User;
  answers!: AnswerInput[];
  nonconformities!: NonconformityOccurrence[];
  notes: InspectionNote[] = [];
  evidence: EvidenceFile[] = [];
}
export const inspectionSchema = new EntitySchema<Inspection, BaseEntity>({
  class: Inspection,
  extends: BaseEntity,
  tableName: 'inspection',
  properties: {
    unit: { kind: 'm:1', entity: () => Unit, deleteRule: 'restrict' },
    sector: { kind: 'm:1', entity: () => Sector, deleteRule: 'restrict' },
    assignment: {
      kind: 'm:1',
      entity: () => InspectionAssignment,
      deleteRule: 'restrict',
      nullable: true,
      unique: true,
    },
    createdBy: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    formVersion: { kind: 'm:1', entity: () => FormVersion, deleteRule: 'restrict' },
    state: { enum: true, items: () => ['DRAFT', 'COMPLETED'], default: 'DRAFT' },
    revision: { type: 'integer', default: 1 },
    cycle: { type: 'integer', default: 1 },
    answers: { type: 'json', columnType: 'jsonb' },
    notes: { type: 'json', columnType: 'jsonb', defaultRaw: "'[]'::jsonb" },
  },
  indexes: [
    { properties: ['unit'] },
    { properties: ['sector'] },
    { properties: ['createdBy'] },
    { properties: ['formVersion'] },
  ],
});
export const inspectionSubmissionSchema = new EntitySchema<InspectionSubmission, BaseEntity>({
  class: InspectionSubmission,
  extends: BaseEntity,
  tableName: 'inspection_submission',
  properties: {
    inspection: { kind: 'm:1', entity: () => Inspection, deleteRule: 'restrict' },
    cycle: { type: 'integer' },
    sourceRevision: { type: 'integer' },
    completedAt: { type: 'datetime', columnType: 'timestamptz' },
    completedBy: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    answers: { type: 'json', columnType: 'jsonb' },
    nonconformities: { type: 'json', columnType: 'jsonb' },
    notes: { type: 'json', columnType: 'jsonb', defaultRaw: "'[]'::jsonb" },
    evidence: { type: 'json', columnType: 'jsonb', defaultRaw: "'[]'::jsonb" },
  },
  uniques: [{ properties: ['inspection', 'cycle'] }],
  indexes: [{ properties: ['completedBy'] }],
});
