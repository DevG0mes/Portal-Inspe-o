import { Account } from '../../../features/auth/account';
import { roleLabels } from '../../../features/admin/config';
import { requireSession } from '../../../lib/session';
export const metadata = { title: 'Minha conta | Portal de Segurança' };
export default async function AccountPage() {
  const session = await requireSession();
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">PREFERÊNCIAS DE ACESSO</span>
        <h1>Minha conta</h1>
        <p>Perfil: {roleLabels[session.role]}</p>
      </div>
      <Account />
    </>
  );
}
