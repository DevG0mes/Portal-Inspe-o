import { InspectionCreate } from '../../../../features/inspection-runner/inspection-create';
import { requireSession } from '../../../../lib/session';
export const metadata = { title: 'Nova inspeção | Portal de Segurança' };
export default async function Page() {
  await requireSession();
  return <InspectionCreate />;
}
