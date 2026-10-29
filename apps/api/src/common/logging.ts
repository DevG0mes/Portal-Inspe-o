/** Explicit allowlist: never serialize requests, exceptions, headers, query strings or job data. */
export interface OperationalEvent {
  event: 'http.completed' | 'http.failed';
  requestId: string;
  method: string;
  status: number;
  durationMs: number;
}
export type OperationalLog = (event: OperationalEvent) => void;
export const writeOperationalLog: OperationalLog = (event) => console.info(JSON.stringify(event));
