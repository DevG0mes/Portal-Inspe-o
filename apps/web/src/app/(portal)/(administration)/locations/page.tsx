import { ResourceList } from '../../../../features/admin/resource-list';
import { requireSession } from '../../../../lib/session';
export default async function Page() {
  const session = await requireSession(true);
  return <ResourceList kind="locations" ownId={session.userId} />;
}
