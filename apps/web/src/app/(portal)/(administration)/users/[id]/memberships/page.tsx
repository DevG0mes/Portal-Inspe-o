import { Memberships } from '../../../../../../features/admin/memberships';
import { requireSession } from '../../../../../../lib/session';
export const metadata = { title: 'Vínculos de acesso | Portal de Segurança' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSession(true);
  const { id } = await params;
  return <Memberships userId={id} />;
}
