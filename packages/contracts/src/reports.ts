import type {
  AnalyticsSummary,
  AnalyticsTrend,
  AnalyticsOccurrence,
  AnalyticsPlan,
  AnalyticsGroups,
} from './analytics.js';
import type { FormVersionSnapshot } from './forms.js';
import type { InspectionSubmissionView } from './inspections.js';
import type { ActionPlanEventView, ActionState } from './action-plans.js';
export const REPORT_STATES = ['QUEUED', 'PROCESSING', 'READY', 'FAILED'] as const;
export type ReportState = (typeof REPORT_STATES)[number];
export type ReportFormat = 'PDF' | 'XLSX';
export type ReportError =
  | 'ACCESS_CHANGED'
  | 'GENERATION_FAILED'
  | 'TOO_LARGE'
  | 'REQUEST_INCOMPLETE';
export interface ReportView {
  id: string;
  format: ReportFormat;
  state: ReportState;
  createdAt: string;
  completedAt: string | null;
  size: number | null;
  sha256: string | null;
  errorCode: ReportError | null;
  canRetry: boolean;
}
export interface ReportFilters {
  from?: string;
  to?: string;
  unitId?: string;
  sectorId?: string;
  formId?: string;
  category?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
export interface ReportScope {
  role: string;
  sectorIds: string[];
  inspectionIds: string[];
  assignmentIds: string[];
  planIds: string[];
}
interface SnapshotBase {
  requestedAt: string;
  requestedBy: string;
  scope: ReportScope;
}
export interface InspectionReportSnapshot extends SnapshotBase {
  kind: 'INSPECTION';
  inspectionId: string;
  unitName: string;
  sectorName: string;
  versionNumber: number;
  form: FormVersionSnapshot;
  visibleQuestionIds: string[];
  submission: InspectionSubmissionView;
  completedByName: string;
  plans: {
    id: string;
    description: string;
    state: ActionState;
    priority: string;
    dueDate: string;
    responsibleName: string;
    history: ActionPlanEventView[];
  }[];
  assets: { id: string; key: string; mime: string; sha256: string | null }[];
}
export interface AnalyticsReportSnapshot extends SnapshotBase {
  kind: 'ANALYTICS';
  filters: ReportFilters;
  summary: AnalyticsSummary;
  trends: AnalyticsTrend[];
  occurrences: AnalyticsOccurrence[];
  groups: AnalyticsGroups;
  plans: AnalyticsPlan[];
}
export type ReportSnapshot = InspectionReportSnapshot | AnalyticsReportSnapshot;
