import Link from 'next/link';
import { requireSession } from '../../../lib/session';
import { serverApi } from '../../../lib/api-server';
export const metadata = { title: 'Visão geral | Portal de Segurança' };
export default async function Dashboard() {
  const session = await requireSession();
  const [units, sectors] = await Promise.all([
    serverApi<{ total: number }>('organization/units?pageSize=1&isActive=true'),
    serverApi<{ total: number }>('organization/sectors?pageSize=1&isActive=true'),
  ]);
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">PORTAL DE INSPEÇÃO</span>
        <h1>Visão geral</h1>
        <p>Organize os acessos e a estrutura para o trabalho de segurança.</p>
      </div>
      <div className="summary-grid">
        <article className="card metric">
          <span>Unidades ativas no seu escopo</span>
          <strong>{units?.total ?? '—'}</strong>
        </article>
        <article className="card metric">
          <span>Setores ativos no seu escopo</span>
          <strong>{sectors?.total ?? '—'}</strong>
        </article>
      </div>
      <section className="inspection-sheet">
        <h2>
          {session.role === 'ADMIN' ? 'Prepare a estrutura do portal' : 'Seu acesso ao portal'}
        </h2>
        <p>
          {session.role === 'ADMIN'
            ? 'Cadastre unidades e setores, crie usuários e defina os vínculos de acesso de cada pessoa.'
            : 'As unidades e os setores disponíveis seguem os vínculos definidos pelo administrador. Caso falte algum acesso, entre em contato com ele.'}
        </p>
        <div className="actions">
          {session.role === 'ADMIN' && (
            <>
              <Link className="button primary" href="/users">
                Administrar usuários
              </Link>
              <Link className="button secondary" href="/units">
                Ver unidades
              </Link>
            </>
          )}
          <Link href="/account">Minha conta</Link>
        </div>
      </section>
    </>
  );
}
