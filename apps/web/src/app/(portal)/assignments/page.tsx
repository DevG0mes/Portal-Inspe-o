import { ScheduleList } from '../../../features/schedules/schedule-list';
import { requireFullPortal } from '../../../lib/session';
export const metadata = { title: 'Inspeções atribuídas | Portal de Segurança' };
export default async function Page() {
  await requireFullPortal();
  return <ScheduleList assignments />;
}
