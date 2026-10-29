export const NOTIFICATION_KINDS = [
  'ASSIGNMENT_ASSIGNED',
  'ASSIGNMENT_DUE',
  'ASSIGNMENT_OVERDUE',
  'ACTION_ASSIGNED',
  'ACTION_DUE',
  'ACTION_OVERDUE',
  'ACTION_REVIEW',
  'ACTION_APPROVED',
  'ACTION_RETURNED',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export interface NotificationView {
  id: string;
  kind: NotificationKind;
  resourceId: string;
  createdAt: string;
  readAt: string | null;
  href: string | null;
  resourceTitle: string | null;
}
