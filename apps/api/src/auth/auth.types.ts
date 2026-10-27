import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '@portal/contracts';

export interface AuthOptions {
  secureCookies: boolean;
  origin: string;
}

export interface AuthenticatedRequest extends Request {
  principal: AuthenticatedPrincipal;
  requestId: string;
}
