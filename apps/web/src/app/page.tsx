export default function Page() {
  return (
    <>
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>
      <header className="site-header">
        <span>PSI Energy</span>
        <span>Segurança do trabalho</span>
      </header>
      <main id="main" className="workspace">
        <article className="inspection-sheet" aria-labelledby="portal-title">
          <p className="status">Ambiente em preparação</p>
          <h1 id="portal-title">Portal de Inspeção de Segurança</h1>
          <p className="intro">Do registro em campo à correção acompanhada.</p>
          <p>
            Um espaço para realizar inspeções, registrar evidências e acompanhar as ações de
            segurança da sua unidade.
          </p>
          <div className="availability">
            <h2>Acesso ao portal</h2>
            <p>
              O ambiente está sendo preparado. As inspeções e os planos de ação estarão disponíveis
              após a liberação do sistema.
            </p>
          </div>
        </article>
      </main>
    </>
  );
}
