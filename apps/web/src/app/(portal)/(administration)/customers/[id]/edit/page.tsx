import { ResourceForm } from '../../../../../../features/admin/resource-form';
import { requireSession } from '../../../../../../lib/session';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(true),
    { id } = await params;
  return <ResourceForm kind="customers" ownId={session.userId} id={id} />;
}
