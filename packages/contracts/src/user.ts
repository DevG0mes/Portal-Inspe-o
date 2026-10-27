export const USER_ROLES = ['COLLABORATOR', 'MANAGER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Safe public identity; persistence and credential fields never belong in this DTO. */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}
