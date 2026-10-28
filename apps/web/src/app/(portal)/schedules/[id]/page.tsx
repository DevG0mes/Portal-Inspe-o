import { ScheduleDetail } from '../../../../features/schedules/schedule-detail';
export const metadata = { title: 'Programação | Portal de Segurança' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ScheduleDetail id={id} />;
}
