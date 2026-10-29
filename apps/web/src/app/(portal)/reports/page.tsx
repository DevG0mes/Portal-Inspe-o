import { requireSession } from '../../../lib/session';
import { ReportCenter } from '../../../features/reports/report-center';
export const metadata = { title: 'Meus relatórios | Portal de Segurança' };
export default async function Page() {
  await requireSession();
  return <ReportCenter />;
}
