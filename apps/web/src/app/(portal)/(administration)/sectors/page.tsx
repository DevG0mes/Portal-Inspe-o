import { ResourceList } from '../../../../features/admin/resource-list';
import { requireSession } from '../../../../lib/session';
export const metadata = { title: 'Tipos de inspeção | Portal de Segurança' };
export default async function Page() {
  const session = await requireSession(true);
  return <ResourceList kind="sectors" ownId={session.userId} />;
}
