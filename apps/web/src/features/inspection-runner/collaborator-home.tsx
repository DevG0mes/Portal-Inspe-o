export function CollaboratorHome() {
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">SEGURANÇA EM CAMPO</span>
        <h1>Meu trabalho</h1>
        <p>Realize suas inspeções e acompanhe cada registro.</p>
      </div>
      <div className="work-shortcuts">
        <a className="card work-shortcut featured" href="/inspections/start">
          <span className="eyebrow">COMEÇAR</span>
          <h2>Nova inspeção</h2>
          <p>Escolha a unidade e o tipo de inspeção.</p>
          <span aria-hidden="true">→</span>
        </a>
        <a className="card work-shortcut" href="/inspections">
          <h2>Minhas inspeções</h2>
          <p>Continue um rascunho ou consulte suas conclusões.</p>
          <span aria-hidden="true">→</span>
        </a>
        <a className="card work-shortcut" href="/assignments">
          <h2>Atribuídas a mim</h2>
          <p>Veja as inspeções e os prazos definidos para você.</p>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </>
  );
}
