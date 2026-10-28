import { FormCatalog } from '../../../../features/form-builder/form-catalog';
import { requireSession } from '../../../../lib/session';
export const metadata = { title: 'Formulários | Portal de Segurança' };
export default async function Page() {
  await requireSession(true);
  return <FormCatalog />;
}
