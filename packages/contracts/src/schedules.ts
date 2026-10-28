export const FREQUENCIES = ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export interface CalendarRule {
  frequency: Frequency;
  startDate: string;
  time: string;
  endDate: string | null;
}
export interface ScheduleSummary extends CalendarRule {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  sectorId: string;
  sectorName: string;
  formId: string;
  formName: string;
  deadlineHours: number;
  isActive: boolean;
  revision: number;
  nextOccurrenceAt: string | null;
  suspensionReason: string | null;
  responsibles: { id: string; name: string }[];
}
export type AssignmentState = 'UPCOMING' | 'PENDING' | 'OVERDUE' | 'CANCELLED';
export interface AssignmentSummary {
  id: string;
  scheduleId: string;
  name: string;
  unitId: string;
  unitName: string;
  sectorId: string;
  sectorName: string;
  formVersionId: string;
  formVersionNumber: number;
  occurrenceAt: string;
  dueAt: string;
  state: AssignmentState;
  responsibles: { id: string; name: string }[];
}
