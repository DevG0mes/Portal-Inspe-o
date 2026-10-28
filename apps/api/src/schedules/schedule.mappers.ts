import type { AssignmentSummary, ScheduleSummary } from '@portal/contracts';
import { assignmentState } from '@portal/scheduling';
import type { InspectionSchedule, InspectionAssignment } from './schedule.entity.js';
export function scheduleSummary(row: InspectionSchedule): ScheduleSummary {
  return {
    id: row.id,
    name: row.name,
    unitId: row.unit.id,
    unitName: row.unit.name,
    sectorId: row.sector.id,
    sectorName: row.sector.name,
    formId: row.form.id,
    formName: row.form.name,
    frequency: row.frequency,
    startDate: row.startDate,
    time: row.time,
    endDate: row.endDate,
    deadlineHours: row.deadlineHours,
    isActive: row.isActive,
    revision: row.revision,
    nextOccurrenceAt: row.nextOccurrenceAt?.toISOString() ?? null,
    suspensionReason: row.suspensionReason,
    responsibles: row.responsibles
      .getItems()
      .map((link) => ({ id: link.user.id, name: link.user.name })),
  };
}
export function assignmentSummary(row: InspectionAssignment, now = new Date()): AssignmentSummary {
  return {
    id: row.id,
    scheduleId: row.schedule.id,
    name: row.schedule.name,
    unitId: row.schedule.unit.id,
    unitName: row.schedule.unit.name,
    sectorId: row.schedule.sector.id,
    sectorName: row.schedule.sector.name,
    formVersionId: row.formVersion.id,
    formVersionNumber: row.formVersion.number,
    occurrenceAt: row.occurrenceAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    state:
      row.status === 'CANCELLED'
        ? 'CANCELLED'
        : assignmentState(row.occurrenceAt.toISOString(), row.dueAt.toISOString(), now),
    responsibles: row.responsibles
      .getItems()
      .map((link) => ({ id: link.user.id, name: link.user.name })),
  };
}
export const schedulePopulate = ['unit', 'sector', 'form', 'responsibles.user'] as const;
export const assignmentPopulate = [
  'schedule.unit',
  'schedule.sector',
  'formVersion',
  'responsibles.user',
] as const;
