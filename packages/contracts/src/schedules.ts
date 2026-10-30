export const FREQUENCIES = ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
import type { InspectionContext } from './organization.js';
export type Frequency = (typeof FREQUENCIES)[number];
export interface CalendarRule {
  frequency: Frequency;
  startDate: string;
  time: string;
  endDate: string | null;
}
export interface ScheduleSummary extends CalendarRule {
  context?: InspectionContext | null;
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
  context?: InspectionContext | null;
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
  inspectionId: string | null;
  inspectionState: 'DRAFT' | 'COMPLETED' | null;
  canStart: boolean;
}
