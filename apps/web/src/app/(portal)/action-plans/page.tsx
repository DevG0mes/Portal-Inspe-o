import { ActionList } from '../../../features/action-plans/action-list';
import { requireSession } from '../../../lib/session';
export const metadata = { title: 'Planos de ação | Portal de Segurança' };
export default async function Page() {
  const user = await requireSession();
  return <ActionList canManage={user.role !== 'COLLABORATOR'} />;
}
