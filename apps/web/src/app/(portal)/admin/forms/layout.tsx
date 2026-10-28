import type { ReactNode } from 'react';
import { requireSession } from '../../../../lib/session';
export default async function FormsLayout({ children }: { children: ReactNode }) {
  await requireSession(true);
  return children;
}
