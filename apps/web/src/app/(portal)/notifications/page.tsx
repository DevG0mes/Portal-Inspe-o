import { NotificationCenter } from '../../../features/notifications/notification-center';
import { requireSession } from '../../../lib/session';
export const metadata = { title: 'Notificações | Portal de Segurança' };
export default async function Page() {
  await requireSession();
  return <NotificationCenter />;
}
