import { ScheduleList } from '../../../features/schedules/schedule-list';
import { requireSession } from '../../../lib/session';
export const metadata = { title: 'Inspeções atribuídas | Portal de Segurança' };
export default async function Page() {
  await requireSession();
  return <ScheduleList assignments />;
}
