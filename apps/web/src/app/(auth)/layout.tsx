import type { ReactNode } from 'react';
import { BrandLogo } from '../../features/shared/brand-logo';
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout" id="main">
      <aside className="auth-identity">
        <BrandLogo priority />
        <span className="eyebrow">SEGURANÇA DO TRABALHO</span>
        <h1>Portal de Inspeção de Segurança</h1>
        <p>Organização, inspeções e acompanhamento da segurança em um só lugar.</p>
        <div className="auth-stamp">REGISTRO · EVIDÊNCIA · AÇÃO</div>
      </aside>
      <section className="auth-panel">{children}</section>
    </main>
  );
}
