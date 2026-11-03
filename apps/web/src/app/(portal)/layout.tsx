import type { ReactNode } from 'react';
import { PortalShell } from '../../features/auth/portal-shell';
import { requireSession } from '../../lib/session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parsePresentation, PRESENTATION_COOKIE } from '../../lib/presentation';
import { PresentationProvider } from '../../features/auth/presentation';
import { PilotProvider } from '../../features/auth/pilot';
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const mode = parsePresentation((await cookies()).get(PRESENTATION_COOKIE)?.value);
  if (!mode) redirect('/experience');
  return (
    <PresentationProvider mode={mode}>
      <PilotProvider enabled={process.env.PORTAL_PILOT === 'true'}>
        <PortalShell role={session.role}>{children}</PortalShell>
      </PilotProvider>
    </PresentationProvider>
  );
}
