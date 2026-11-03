import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { serverApi } from './api-server';
import type { AuthenticatedPrincipal } from '@portal/contracts';
import { homeFor } from './presentation';
export type Principal = AuthenticatedPrincipal;
export const getSession = cache(() => serverApi<Principal>('auth/me'));
export async function requireSession(admin = false) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');
  if (admin && session.role !== 'ADMIN') redirect(homeFor(session.role));
  return session;
}
export async function requireManagementSession() {
  const session = await requireSession();
  if (session.role === 'COLLABORATOR') redirect('/my-work');
  return session;
}
export async function requireFullPortal() {
  const session = await requireSession();
  if (process.env.PORTAL_PILOT === 'true') redirect(homeFor(session.role));
  return session;
}
