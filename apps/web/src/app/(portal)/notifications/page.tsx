import { NotificationCenter } from '../../../features/notifications/notification-center';
import { requireFullPortal } from '../../../lib/session';
export const metadata = { title: 'Notificações | Portal de Segurança' };
export default async function Page() {
  await requireFullPortal();
  return <NotificationCenter />;
}
