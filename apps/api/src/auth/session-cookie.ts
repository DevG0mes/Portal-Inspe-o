import type { CookieOptions, Response } from 'express';
import type { AuthOptions } from './auth.types.js';
import { SESSION_TTL_MS } from './auth.policy.js';

export const SESSION_COOKIE = 'portal_session';

function cookieOptions(options: AuthOptions): CookieOptions {
  return { httpOnly: true, secure: options.secureCookies, sameSite: 'strict', path: '/api' };
}

export function setSessionCookie(response: Response, token: string, options: AuthOptions) {
  response.cookie(SESSION_COOKIE, token, { ...cookieOptions(options), maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(response: Response, options: AuthOptions) {
  response.clearCookie(SESSION_COOKIE, cookieOptions(options));
}

/** Reject ambiguous duplicate cookies and malformed tokens before querying persistence. */
export function readSessionCookie(header: string | undefined): string | undefined {
  const matches = header
    ?.split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (matches?.length !== 1) return undefined;
  const value = matches[0]!.slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
