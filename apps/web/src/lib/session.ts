import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { serverApi } from './api-server';
import type { AuthenticatedPrincipal } from '@portal/contracts';
export type Principal = AuthenticatedPrincipal;
export const getSession = cache(() => serverApi<Principal>('auth/me'));
export async function requireSession(admin = false) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.mustChangePassword) redirect('/change-password');
  if (admin && session.role !== 'ADMIN') redirect('/dashboard');
  return session;
}
