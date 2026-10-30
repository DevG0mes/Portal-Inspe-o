import { ResourceForm } from '../../../../../features/admin/resource-form';
import { requireSession } from '../../../../../lib/session';
export default async function Page() {
  const session = await requireSession(true);
  return <ResourceForm kind="customers" ownId={session.userId} />;
}
