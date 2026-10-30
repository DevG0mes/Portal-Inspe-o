'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ErrorNotice } from '../shared/error-notice';
import type { Principal } from '../../lib/session';
import { roleLabels } from '../admin/config';
import { UnreadIndicator } from '../notifications/unread-indicator';
import { BrandLogo } from '../shared/brand-logo';
export function PortalShell({ role, children }: { role: Principal['role']; children: ReactNode }) {
  const path = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const links = [
    ['/dashboard', 'Visão geral'],
    ['/assignments', 'Atribuições'],
    ['/inspections', 'Inspeções'],
    ['/action-plans', 'Planos de ação'],
    ['/notifications', 'Notificações'],
    ['/reports', 'Meus relatórios'],
    ...(role !== 'COLLABORATOR' ? [['/schedules', 'Programações']] : []),
    ...(role === 'ADMIN'
      ? [
          ['/users', 'Usuários'],
          ['/units', 'Unidades'],
          ['/sectors', 'Setores'],
          ['/customers', 'Clientes'],
          ['/locations', 'Locais'],
          ['/admin/forms', 'Formulários'],
        ]
      : []),
    ['/account', 'Minha conta'],
  ];
  async function logout() {
    setBusy(true);
    try {
      await api('auth/logout', { method: 'POST', body: '{}' });
      window.location.assign('/login');
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }
  return (
    <div className="portal">
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">
        <Link className="wordmark" href="/dashboard" aria-label="PSI Energy · Portal de Segurança">
          <BrandLogo />
          <strong>Portal de Segurança</strong>
        </Link>
        <button
          className="menu-toggle button secondary"
          aria-expanded={expanded}
          aria-controls="portal-nav"
          onClick={() => setExpanded(!expanded)}
        >
          Menu
        </button>
        <nav id="portal-nav" aria-label="Principal" className={expanded ? 'expanded' : ''}>
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href!}
              aria-current={path.startsWith(href!) ? 'page' : undefined}
              onClick={() => setExpanded(false)}
            >
              {label}
              {href === '/notifications' && <UnreadIndicator />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>{roleLabels[role]}</span>
          <Button variant="secondary" onClick={logout} disabled={busy}>
            {busy ? 'Saindo…' : 'Sair'}
          </Button>
        </div>
      </aside>
      <div className="portal-content">
        <header className="portal-header">
          <span>SEGURANÇA DO TRABALHO</span>
          <span>PSI Energy · Ambiente interno</span>
        </header>
        <main id="main" tabIndex={-1}>
          {error !== undefined && <ErrorNotice error={error} />}
          {children}
        </main>
      </div>
    </div>
  );
}
