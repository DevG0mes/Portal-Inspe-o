import type { ActionState } from './action-plans.js';
export interface QssmaDashboard {
  targets: { monthlyInspections: number; conformityRate: number };
  metrics: {
    scopeDeviationTotal: number;
    inspections: number;
    conformingInspections: number;
    nonconformingInspections: number;
    deviations: number;
    treated: number;
    pending: number;
    authorDays: number;
    authorDaysWithDeviation: number;
    authorDaysWithoutDeviation: number;
    dayConformityRate: number | null;
    averageDeviations: number | null;
    treatmentRate: number | null;
  };
  months: { month: string; inspections: number; deviations: number; treated: number }[];
  statuses: { label: string; count: number }[];
  priorities: { label: string; count: number }[];
  rankings: {
    types: { label: string; count: number }[];
    locations: { label: string; count: number }[];
    inspectors: { label: string; count: number }[];
    categories: { label: string; count: number }[];
  };
}
export interface AnalyticsSummary {
  from: string;
  to: string;
  inspections: {
    completed: number;
    drafts: number;
    pending: number;
    overdue: number;
    evaluatedAnswers: number;
    nonconformingAnswers: number;
    nonconformities: number;
    conformityRate: number | null;
  };
  plans: {
    total: number;
    open: number;
    inProgress: number;
    awaitingValidation: number;
    completed: number;
    overdue: number;
    critical: number;
    averageResolutionHours: number | null;
  };
  administration: {
    activeUsers: number;
    units: number;
    sectors: number;
    publishedForms: number;
    draftForms: number;
    archivedForms: number;
  } | null;
}
export interface AnalyticsTrend {
  date: string;
  completed: number;
  nonconformities: number;
}
export interface AnalyticsOccurrence {
  customerName?: string | null;
  locationName?: string | null;
  actionText?: string | null;
  treatmentStatus?: string;
  submissionId: string;
  inspectionId: string;
  questionId: string;
  questionLabel: string;
  unitName: string;
  sectorName: string;
  formTitle: string;
  category: string;
  priority: string;
  completedAt: string;
}
export interface AnalyticsPlan {
  id: string;
  description: string;
  state: ActionState;
  priority: string;
  dueAt: string;
  overdue: boolean;
  unitName: string;
  sectorName: string;
}
export interface AnalyticsGroups {
  units: { label: string; count: number }[];
  sectors: { label: string; count: number }[];
  forms: { label: string; count: number }[];
  categories: { label: string; count: number }[];
  priorities: { label: string; count: number }[];
}
