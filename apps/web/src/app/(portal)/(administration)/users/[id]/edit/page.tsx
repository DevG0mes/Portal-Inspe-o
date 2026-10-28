import { ResourceForm } from '../../../../../../features/admin/resource-form';
import { requireSession } from '../../../../../../lib/session';
export const metadata = { title: 'Editar cadastro | Usuários' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(true);
  const { id } = await params;
  return <ResourceForm kind="users" id={id} ownId={session.userId} />;
}
