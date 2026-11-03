import { Dashboard } from '../../../features/dashboard/dashboard';
import { requireManagementSession } from '../../../lib/session';
export const metadata = { title: 'Visão geral | Portal de Segurança' };
export default async function Page() {
  const session = await requireManagementSession();
  return <Dashboard role={session.role} />;
}
