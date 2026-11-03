'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ErrorNotice } from '../shared/error-notice';
import type { Principal } from '../../lib/session';
import { roleLabels } from '../admin/config';
import { usePilot } from './pilot';
import { NotificationBell } from '../notifications/notification-bell';
import { BrandLogo } from '../shared/brand-logo';
import { usePresentation } from './presentation';
import { homeFor } from '../../lib/presentation';
export function PortalShell({ role, children }: { role: Principal['role']; children: ReactNode }) {
  const path = usePathname();
  const pilot = usePilot();
  const available = ([href]: string[]) =>
    !pilot || !['/assignments', '/action-plans', '/reports', '/schedules'].includes(href!);
  const mode = usePresentation();
  const collaborator = role === 'COLLABORATOR';
  const fieldMode = collaborator && mode === 'mobile';
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const personalLinks = [
    ['/my-work', 'Início'],
    ['/inspections', 'Minhas inspeções'],
    ['/assignments', 'Atribuídas a mim'],
    ['/account', 'Minha conta'],
  ];
  const links = collaborator
    ? personalLinks
    : [
        ['/dashboard', 'Visão geral'],
        ['/assignments', 'Atribuições'],
        ['/inspections', 'Inspeções'],
        ['/action-plans', 'Planos de ação'],
        ['/reports', 'Meus relatórios'],
        ['/schedules', 'Programações'],
        ...(role === 'ADMIN'
          ? [
              ['/users', 'Usuários'],
              ['/units', 'Unidades'],
              ['/sectors', 'Tipos de inspeção'],
              ['/customers', 'Clientes'],
              ['/locations', 'Subestações'],
              ['/addresses', 'Endereços'],
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
    <div
      className={`portal mode-${mode}${fieldMode ? ' field-mode' : ''}${pilot ? ' pilot-mode' : ''}`}
    >
      <a className="skip-link" href="#main">
        Ir para o conteúdo
      </a>
      {!fieldMode && (
        <aside className="sidebar">
          <Link
            className="wordmark"
            href={homeFor(role)}
            aria-label="PSI Energy · Portal de Segurança"
          >
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
            {links.filter(available).map(([href, label]) => (
              <Link
                key={href}
                href={href!}
                aria-current={path.startsWith(href!) ? 'page' : undefined}
                onClick={() => setExpanded(false)}
              >
                {label}
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
      )}
      <div className="portal-content">
        <header className="portal-header">
          {fieldMode ? (
            <Link href="/my-work" aria-label="PSI Energy · Início">
              <BrandLogo />
            </Link>
          ) : (
            <span>SEGURANÇA DO TRABALHO</span>
          )}
          <span>{fieldMode ? 'Segurança em campo' : 'PSI Energy · Ambiente interno'}</span>
          {!pilot && <NotificationBell key={path} />}
        </header>
        <main id="main" tabIndex={-1}>
          {pilot && <p className="muted">Ambiente de homologação · Use dados de demonstração.</p>}
          {error !== undefined && <ErrorNotice error={error} />}
          {children}
        </main>
      </div>
      {fieldMode && (
        <nav className="field-nav" aria-label="Principal">
          {personalLinks.filter(available).map(([href, label]) => (
            <Link
              key={href}
              href={href!}
              aria-current={path.startsWith(href!) ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
