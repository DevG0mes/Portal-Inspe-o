import type { ReactNode } from 'react';
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout" id="main">
      <aside className="auth-identity">
        <span className="eyebrow">PSI ENERGY · SEGURANÇA</span>
        <h1>Portal de Inspeção de Segurança</h1>
        <p>Organização, inspeções e acompanhamento da segurança em um só lugar.</p>
        <div className="auth-stamp">REGISTRO · EVIDÊNCIA · AÇÃO</div>
      </aside>
      <section className="auth-panel">{children}</section>
    </main>
  );
}
