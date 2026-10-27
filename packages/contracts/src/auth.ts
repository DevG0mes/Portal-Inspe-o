import type { UserRole } from './user.js';

export interface AuthenticatedPrincipal {
  userId: string;
  role: UserRole;
  sessionId: string;
  mustChangePassword: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
