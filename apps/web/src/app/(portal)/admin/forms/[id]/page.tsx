import { Builder } from '../../../../../features/form-builder/builder';
import { requireSession } from '../../../../../lib/session';
export const metadata = { title: 'Construtor de formulário | Portal de Segurança' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSession(true);
  const { id } = await params;
  return <Builder templateId={id} />;
}
