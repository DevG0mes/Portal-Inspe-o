import { ResourceForm } from '../../../../../features/admin/resource-form';
import { requireSession } from '../../../../../lib/session';
export const metadata = { title: 'Novo cadastro | Setores' };
export default async function Page() {
  const session = await requireSession(true);
  return <ResourceForm kind="sectors" ownId={session.userId} />;
}
