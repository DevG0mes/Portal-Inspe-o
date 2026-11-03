import type { ReactNode } from 'react';
import { requireFullPortal, requireManagementSession } from '../../../lib/session';
export default async function Layout({ children }: { children: ReactNode }) {
  await requireFullPortal();
  await requireManagementSession();
  return children;
}
