'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { NotificationKind, NotificationView, Paginated } from '@portal/contracts';
import { Button, Notice, Skeleton } from '@portal/ui';
import { api } from '../../lib/api-client';
import { useResource } from '../shared/use-resource';
import { ErrorNotice } from '../shared/error-notice';
import { Pagination } from '../shared/pagination';
import { localInstant } from '../schedules/presentation';
const labels: Record<NotificationKind, string> = {
  ASSIGNMENT_ASSIGNED: 'Inspeção atribuída',
  ASSIGNMENT_DUE: 'Inspeção com prazo próximo',
  ASSIGNMENT_OVERDUE: 'Inspeção vencida',
  ACTION_ASSIGNED: 'Plano de ação atribuído',
  ACTION_DUE: 'Correção com prazo próximo',
  ACTION_OVERDUE: 'Correção vencida',
  ACTION_REVIEW: 'Correção aguardando validação',
  ACTION_APPROVED: 'Correção aprovada',
  ACTION_RETURNED: 'Correção devolvida para ajuste',
};
export function NotificationCenter() {
  const params = useSearchParams(),
    router = useRouter(),
    page = Math.max(1, Number(params.get('page')) || 1),
    unread = params.get('unread') === 'true';
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const result = useResource<Paginated<NotificationView>>(
    `notifications?page=${page}&pageSize=10${unread ? '&unread=true' : ''}`,
    revision,
  );
  function refresh() {
    setRevision((r) => r + 1);
    window.dispatchEvent(new Event('notifications-read'));
  }
  function navigate(next: number, onlyUnread = unread) {
    router.replace(`/notifications?page=${next}${onlyUnread ? '&unread=true' : ''}`, {
      scroll: false,
    });
  }
  async function read(id?: string) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(id ? `notifications/${id}/read` : 'notifications/read-all', {
        method: 'POST',
        body: '{}',
      });
      refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ACOMPANHAMENTO · AVISOS</span>
        <h1>Notificações</h1>
        <p>Atribuições, prazos e decisões do seu trabalho. Os links consideram seu acesso atual.</p>
      </div>
      <section className="card">
        <div className="actions">
          <Button variant="secondary" disabled={busy} onClick={refresh}>
            Atualizar avisos
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => read()}>
            Marcar todas como lidas
          </Button>
        </div>
        <nav className="actions" aria-label="Filtro de leitura">
          <a
            href="/notifications"
            aria-current={!unread ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(1, false);
            }}
          >
            Todas
          </a>
          <a
            href="/notifications?unread=true"
            aria-current={unread ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(1, true);
            }}
          >
            Não lidas
          </a>
        </nav>
        {error !== undefined && <ErrorNotice error={error} />}
        {result.loading ? (
          <Skeleton />
        ) : result.error ? (
          <ErrorNotice error={result.error} />
        ) : (
          result.data && (
            <>
              {!result.data.data.length ? (
                <Notice>Nenhuma notificação neste filtro.</Notice>
              ) : (
                <ul className="notification-list">
                  {result.data.data.map((n) => (
                    <li key={n.id}>
                      <strong>{labels[n.kind]}</strong>
                      {n.resourceTitle && <p>{n.resourceTitle}</p>}
                      <span className="cell-detail">
                        <time dateTime={n.createdAt}>{localInstant(n.createdAt)}</time> ·{' '}
                        <span className="badge">{n.readAt ? 'Lida' : 'Não lida'}</span>
                      </span>
                      <div className="actions">
                        {n.href ? (
                          <a href={n.href}>Abrir registro relacionado</a>
                        ) : (
                          <span className="muted">
                            Registro indisponível para seu acesso atual.
                          </span>
                        )}
                        {!n.readAt && (
                          <Button variant="secondary" disabled={busy} onClick={() => read(n.id)}>
                            Marcar como lida
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Pagination page={page} pageSize={10} total={result.data.total} onPage={navigate} />
            </>
          )
        )}
      </section>
    </>
  );
}
