import { redirect } from 'next/navigation';
import { AuthForm } from '../../../features/auth/auth-form';
import { getSession } from '../../../lib/session';
export const metadata = { title: 'Alterar senha | Portal de Segurança' };
export default async function ChangePassword() {
  const session = await getSession();
  if (!session) redirect('/login');
  return (
    <>
      <span className="eyebrow">PROTEÇÃO DA CONTA</span>
      <h2>Defina sua nova senha</h2>
      <p className="muted">
        {session.mustChangePassword
          ? 'Para acessar o portal, substitua a senha temporária.'
          : 'A alteração encerra suas outras sessões.'}
      </p>
      <AuthForm mode="change" />
    </>
  );
}
