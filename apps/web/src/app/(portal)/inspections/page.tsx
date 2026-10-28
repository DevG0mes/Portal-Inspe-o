import { InspectionList } from '../../../features/inspection-runner/inspection-list';
import { requireSession } from '../../../lib/session';
export const metadata = { title: 'Inspeções | Portal de Segurança' };
export default async function Page() {
  await requireSession();
  return <InspectionList />;
}
