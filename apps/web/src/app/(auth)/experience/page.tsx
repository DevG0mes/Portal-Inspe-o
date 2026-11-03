import { requireSession } from '../../../lib/session';
import { choosePresentation } from './actions';
export const metadata = { title: 'Escolha sua visualização | Portal de Segurança' };
export default async function Page() {
  await requireSession();
  return (
    <>
      <span className="eyebrow">SEU JEITO DE ACESSAR</span>
      <h2>Como deseja usar o portal?</h2>
      <p className="muted">
        Escolha a visualização mais confortável. Você pode trocar depois em sua conta.
      </p>
      <form action={choosePresentation} className="experience-options">
        <button className="experience-option" name="mode" value="desktop" type="submit">
          <svg
            viewBox="0 0 24 24"
            width="36"
            height="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M12 17v4M7 21h10" />
          </svg>
          <strong>Desktop</strong>
          <span>Navegação lateral e mais informações na tela.</span>
        </button>
        <button className="experience-option" name="mode" value="mobile" type="submit">
          <svg
            viewBox="0 0 24 24"
            width="36"
            height="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="6" y="1" width="12" height="22" rx="3" />
            <path d="M10 4h4M11 20h2" />
          </svg>
          <strong>Celular</strong>
          <span>Navegação compacta e inspeção por etapas.</span>
        </button>
      </form>
    </>
  );
}
