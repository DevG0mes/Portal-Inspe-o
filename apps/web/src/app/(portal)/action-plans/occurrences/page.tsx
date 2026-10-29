import { redirect } from 'next/navigation';
import { Occurrences } from '../../../../features/action-plans/occurrences';
import { requireSession } from '../../../../lib/session';
export const metadata = { title: 'Não conformidades | Portal de Segurança' };
export default async function Page() {
  const user = await requireSession();
  if (user.role === 'COLLABORATOR') redirect('/action-plans');
  return <Occurrences />;
}
