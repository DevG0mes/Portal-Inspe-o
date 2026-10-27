/** Public health response. Diagnostic exceptions must never cross this boundary. */
export interface ReadinessResponse {
  status: 'ok' | 'unavailable';
  dependencies: Record<string, 'up' | 'down'>;
}
