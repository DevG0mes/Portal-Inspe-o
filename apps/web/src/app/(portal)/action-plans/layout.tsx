import type { ReactNode } from 'react';
import { requireManagementSession } from '../../../lib/session';
export default async function Layout({ children }: { children: ReactNode }) {
  await requireManagementSession();
  return children;
}
