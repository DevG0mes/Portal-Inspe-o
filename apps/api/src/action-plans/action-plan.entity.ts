import { EntitySchema } from '@mikro-orm/core';
import {
  ACTION_STATES,
  type ActionState,
  type ActionPlanEventView,
  type EvidenceFile,
} from '@portal/contracts';
import { BaseEntity } from '../database/base.entity.js';
import { User } from '../identity/user.entity.js';
import { Unit } from '../organization/unit.entity.js';
import { Sector } from '../organization/sector.entity.js';
import { InspectionSubmission } from '../inspections/inspection.entity.js';
export class ActionPlan extends BaseEntity {
  submission!: InspectionSubmission;
  questionId!: string;
  unit!: Unit;
  sector!: Sector;
  responsible!: User;
  createdBy!: User;
  description!: string;
  category!: string;
  priority!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueDate!: string;
  dueAt!: Date;
  state: ActionState = 'OPEN';
  revision = 1;
  completedAt: Date | null = null;
}
export class ActionPlanEvent extends BaseEntity {
  actionPlan!: ActionPlan;
  actor!: User;
  commandId!: string;
  commandHash!: string;
  resultRevision!: number;
  type!: ActionPlanEventView['type'];
  fromState: ActionState | null = null;
  toState!: ActionState;
  text: string | null = null;
  evidence: EvidenceFile[] = [];
  assignment: {
    responsibleId: string;
    responsibleName: string;
    dueDate: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  } | null = null;
}
export const actionPlanSchema = new EntitySchema<ActionPlan, BaseEntity>({
  class: ActionPlan,
  extends: BaseEntity,
  tableName: 'action_plan',
  properties: {
    submission: { kind: 'm:1', entity: () => InspectionSubmission, deleteRule: 'restrict' },
    questionId: { type: 'uuid' },
    unit: { kind: 'm:1', entity: () => Unit, deleteRule: 'restrict' },
    sector: { kind: 'm:1', entity: () => Sector, deleteRule: 'restrict' },
    responsible: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    createdBy: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    description: { type: 'text' },
    category: { type: 'string', length: 160 },
    priority: { enum: true, items: () => ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    dueDate: { type: 'string', length: 10 },
    dueAt: { type: 'datetime', columnType: 'timestamptz' },
    state: { enum: true, items: () => ACTION_STATES, default: 'OPEN' },
    revision: { type: 'integer', default: 1 },
    completedAt: { type: 'datetime', columnType: 'timestamptz', nullable: true },
  },
  uniques: [{ properties: ['submission', 'questionId'] }],
  indexes: [
    { properties: ['unit'] },
    { properties: ['sector'] },
    { properties: ['responsible'] },
    { properties: ['createdBy'] },
    { properties: ['state', 'dueAt'] },
  ],
});
export const actionPlanEventSchema = new EntitySchema<ActionPlanEvent, BaseEntity>({
  class: ActionPlanEvent,
  extends: BaseEntity,
  tableName: 'action_plan_event',
  properties: {
    actionPlan: { kind: 'm:1', entity: () => ActionPlan, deleteRule: 'restrict' },
    actor: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    commandId: { type: 'uuid' },
    commandHash: { type: 'string', length: 64 },
    resultRevision: { type: 'integer' },
    type: { type: 'string', length: 30 },
    fromState: { enum: true, items: () => ACTION_STATES, nullable: true },
    toState: { enum: true, items: () => ACTION_STATES },
    text: { type: 'text', nullable: true },
    evidence: { type: 'json', columnType: 'jsonb' },
    assignment: { type: 'json', columnType: 'jsonb', nullable: true },
  },
  uniques: [{ properties: ['actionPlan', 'commandId'] }],
  indexes: [{ properties: ['actor'] }, { properties: ['actionPlan', 'createdAt'] }],
});
