/** Public health response. Diagnostic exceptions must never cross this boundary. */
export interface ReadinessResponse {
  status: 'ok' | 'unavailable';
  dependencies: Record<string, 'up' | 'down'>;
}

export * from './auth.js';
export * from './user.js';
export * from './access.js';
export * from './organization.js';
export * from './forms.js';
export * from './schedules.js';
export * from './inspections.js';
export * from './files.js';
export * from './action-plans.js';
