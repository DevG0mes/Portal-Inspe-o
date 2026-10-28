import type { ReactNode } from 'react';
import { PortalShell } from '../../features/auth/portal-shell';
import { requireSession } from '../../lib/session';
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return <PortalShell role={session.role}>{children}</PortalShell>;
}
