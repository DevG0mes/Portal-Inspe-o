import { Collection, EntitySchema } from '@mikro-orm/core';
import { FREQUENCIES, type Frequency } from '@portal/contracts';
import { BaseEntity } from '../database/base.entity.js';
import { Unit } from '../organization/unit.entity.js';
import { Sector } from '../organization/sector.entity.js';
import { User } from '../identity/user.entity.js';
import { FormTemplate } from '../forms/entities/form-template.entity.js';
import { FormVersion } from '../forms/entities/form-version.entity.js';
export class InspectionSchedule extends BaseEntity {
  name!: string;
  unit!: Unit;
  sector!: Sector;
  form!: FormTemplate;
  createdBy!: User;
  frequency!: Frequency;
  startDate!: string;
  time!: string;
  endDate: string | null = null;
  deadlineHours!: number;
  isActive = true;
  revision = 1;
  nextOccurrenceAt: Date | null = null;
  suspensionReason: string | null = null;
  responsibles = new Collection<ScheduleResponsible>(this);
}
export class ScheduleResponsible extends BaseEntity {
  schedule!: InspectionSchedule;
  user!: User;
}
export class InspectionAssignment extends BaseEntity {
  schedule!: InspectionSchedule;
  formVersion!: FormVersion;
  occurrenceAt!: Date;
  dueAt!: Date;
  status: 'PLANNED' | 'CANCELLED' = 'PLANNED';
  responsibles = new Collection<AssignmentResponsible>(this);
}
export class AssignmentResponsible extends BaseEntity {
  assignment!: InspectionAssignment;
  user!: User;
}
export const scheduleSchema = new EntitySchema<InspectionSchedule, BaseEntity>({
  class: InspectionSchedule,
  extends: BaseEntity,
  tableName: 'inspection_schedule',
  checks: [
    {
      name: 'inspection_schedule_deadline_hours_check',
      expression: 'deadline_hours >= 1 and deadline_hours <= 8760',
    },
  ],
  properties: {
    name: { type: 'string', length: 160 },
    unit: { kind: 'm:1', entity: () => Unit, deleteRule: 'restrict' },
    sector: { kind: 'm:1', entity: () => Sector, deleteRule: 'restrict' },
    form: { kind: 'm:1', entity: () => FormTemplate, deleteRule: 'restrict' },
    createdBy: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
    frequency: { enum: true, items: () => FREQUENCIES },
    startDate: { type: 'string', length: 10 },
    time: { type: 'string', length: 5 },
    endDate: { type: 'string', length: 10, nullable: true },
    deadlineHours: { type: 'integer' },
    isActive: { type: 'boolean', default: true },
    revision: { type: 'integer', default: 1 },
    nextOccurrenceAt: { type: 'datetime', columnType: 'timestamptz', nullable: true },
    suspensionReason: { type: 'text', nullable: true },
    responsibles: { kind: '1:m', entity: () => ScheduleResponsible, mappedBy: 'schedule' },
  },
  indexes: [
    { properties: ['unit'] },
    { properties: ['sector'] },
    { properties: ['form'] },
    { properties: ['createdBy'] },
    { properties: ['isActive', 'nextOccurrenceAt'] },
  ],
});
export const scheduleResponsibleSchema = new EntitySchema<ScheduleResponsible, BaseEntity>({
  class: ScheduleResponsible,
  extends: BaseEntity,
  tableName: 'schedule_responsible',
  properties: {
    schedule: { kind: 'm:1', entity: () => InspectionSchedule, deleteRule: 'restrict' },
    user: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
  },
  uniques: [{ properties: ['schedule', 'user'] }],
  indexes: [{ properties: ['user'] }],
});
export const assignmentSchema = new EntitySchema<InspectionAssignment, BaseEntity>({
  class: InspectionAssignment,
  extends: BaseEntity,
  tableName: 'inspection_assignment',
  properties: {
    schedule: { kind: 'm:1', entity: () => InspectionSchedule, deleteRule: 'restrict' },
    formVersion: { kind: 'm:1', entity: () => FormVersion, deleteRule: 'restrict' },
    occurrenceAt: { type: 'datetime', columnType: 'timestamptz' },
    dueAt: { type: 'datetime', columnType: 'timestamptz' },
    status: { enum: true, items: () => ['PLANNED', 'CANCELLED'], default: 'PLANNED' },
    responsibles: { kind: '1:m', entity: () => AssignmentResponsible, mappedBy: 'assignment' },
  },
  uniques: [{ properties: ['schedule', 'occurrenceAt'] }],
  indexes: [{ properties: ['formVersion'] }, { properties: ['dueAt'] }],
});
export const assignmentResponsibleSchema = new EntitySchema<AssignmentResponsible, BaseEntity>({
  class: AssignmentResponsible,
  extends: BaseEntity,
  tableName: 'assignment_responsible',
  properties: {
    assignment: { kind: 'm:1', entity: () => InspectionAssignment, deleteRule: 'restrict' },
    user: { kind: 'm:1', entity: () => User, deleteRule: 'restrict' },
  },
  uniques: [{ properties: ['assignment', 'user'] }],
  indexes: [{ properties: ['user'] }],
});
