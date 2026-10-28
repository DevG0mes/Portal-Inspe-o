import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/session';
export default async function Layout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  if (session.role === 'COLLABORATOR') redirect('/assignments');
  return children;
}
