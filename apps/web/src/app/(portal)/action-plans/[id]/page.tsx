import { ActionDetail } from '../../../../features/action-plans/action-detail';
import { requireSession } from '../../../../lib/session';
export const metadata = { title: 'Plano de ação | Portal de Segurança' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  return <ActionDetail id={id} />;
}
