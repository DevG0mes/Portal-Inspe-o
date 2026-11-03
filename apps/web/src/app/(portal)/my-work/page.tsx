import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/session';
import { CollaboratorHome } from '../../../features/inspection-runner/collaborator-home';
export const metadata = { title: 'Meu trabalho | Portal de Segurança' };
export default async function Page() {
  const session = await requireSession();
  if (session.role !== 'COLLABORATOR') redirect('/dashboard');
  return <CollaboratorHome />;
}
