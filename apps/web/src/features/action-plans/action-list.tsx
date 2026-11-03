'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ActionPlanSummary, Paginated, ActionState } from '@portal/contracts';
import { Button, Field, Select, Skeleton } from '@portal/ui';
import { useResource } from '../shared/use-resource';
import { ErrorNotice } from '../shared/error-notice';
import { Pagination } from '../shared/pagination';
import { localInstant } from '../schedules/presentation';
import { priorityLabels } from '../form-builder/model';
import { actionStates } from './presentation';
export function ActionList({ canManage }: { canManage: boolean }) {
  const params = useSearchParams(),
    router = useRouter(),
    [revision, setRevision] = useState(0);
  const state = params.get('state') ?? '',
    overdue = params.get('overdue') === 'true' ? 'true' : '',
    page = Math.max(1, Number(params.get('page')) || 1);
  const validState = Object.hasOwn(actionStates, state) ? state : '';
  const result = useResource<Paginated<ActionPlanSummary>>(
    `action-plans?page=${page}&pageSize=10${validState ? `&state=${validState}` : ''}${overdue ? '&overdue=true' : ''}`,
    revision,
  );
  function navigate(page: number, nextState = validState, nextOverdue = overdue) {
    const query = new URLSearchParams({ page: String(page) });
    if (nextState) query.set('state', nextState);
    if (nextOverdue) query.set('overdue', 'true');
    router.replace(`/action-plans?${query}`, { scroll: false });
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">CORREÇÃO · ACOMPANHAMENTO</span>
        <h1>Planos de ação</h1>
        <p>
          Acompanhe as correções até a decisão gerencial. O vencimento é indicado separadamente da
          situação.
        </p>
        {canManage && (
          <a className="button primary" href="/action-plans/occurrences">
            Não conformidades sem plano
          </a>
        )}
      </div>
      <section className="card list-card">
        <div className="filters">
          <Field id="action-state" label="Situação">
            <Select
              id="action-state"
              value={validState}
              onChange={(event) => navigate(1, event.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(actionStates).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="action-late" label="Prazo">
            <Select
              id="action-late"
              value={overdue}
              onChange={(event) => navigate(1, validState, event.target.value)}
            >
              <option value="">Todos os prazos</option>
              <option value="true">Somente vencidos</option>
            </Select>
          </Field>
          <Button
            variant="secondary"
            disabled={result.loading}
            onClick={() => setRevision(revision + 1)}
          >
            Atualizar lista
          </Button>
        </div>
        {result.loading ? (
          <Skeleton />
        ) : result.error ? (
          <>
            <ErrorNotice error={result.error} />
            <Button onClick={() => setRevision(revision + 1)}>Tentar novamente</Button>
          </>
        ) : (
          result.data && (
            <>
              {!result.data.data.length ? (
                <div className="empty-state">
                  <h2>Nenhum plano encontrado</h2>
                  <p>
                    {canManage
                      ? 'Crie um plano a partir de uma não conformidade ou ajuste os filtros.'
                      : 'Os planos atribuídos a você aparecerão aqui.'}
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Planos de ação no seu escopo</caption>
                    <thead>
                      <tr>
                        <th scope="col">Correção e local</th>
                        <th scope="col">Responsável</th>
                        <th scope="col">Prazo</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.data.map((row) => (
                        <tr key={row.id}>
                          <td data-label="Correção e local">
                            <strong>{row.description}</strong>
                            <span className="cell-detail">
                              {row.unitName} · {row.sectorName}
                            </span>
                            <span className="cell-detail">
                              {row.category} · {priorityLabels[row.priority]}
                            </span>
                          </td>
                          <td data-label="Responsável">{row.responsibleName}</td>
                          <td data-label="Prazo">
                            <time dateTime={row.dueAt}>{localInstant(row.dueAt)}</time>
                            {row.overdue && <span className="badge overdue">Vencido</span>}
                          </td>
                          <td data-label="Situação">
                            <span className={`badge ${row.state === 'COMPLETED' ? 'active' : ''}`}>
                              {actionStates[row.state as ActionState]}
                            </span>
                          </td>
                          <td data-label="Ações">
                            <a href={`/action-plans/${row.id}`}>
                              Abrir plano<span className="sr-only"> {row.description}</span>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={page} pageSize={10} total={result.data.total} onPage={navigate} />
            </>
          )
        )}
      </section>
    </>
  );
}
