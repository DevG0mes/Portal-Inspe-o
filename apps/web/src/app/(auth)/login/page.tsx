import { redirect } from 'next/navigation';
import { AuthForm } from '../../../features/auth/auth-form';
import { getSession } from '../../../lib/session';
export const metadata = { title: 'Entrar | Portal de Segurança' };
export default async function Login() {
  const session = await getSession();
  if (session) redirect(session.mustChangePassword ? '/change-password' : '/experience');
  return (
    <>
      <span className="eyebrow">ACESSO AO PORTAL</span>
      <h2>Bem-vindo de volta</h2>
      <p className="muted">Use o e-mail cadastrado e sua senha para continuar.</p>
      <AuthForm mode="login" />
    </>
  );
}
