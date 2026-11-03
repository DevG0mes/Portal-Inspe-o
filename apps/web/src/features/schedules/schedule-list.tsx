'use client';
import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Field, Input, Select, Skeleton } from '@portal/ui';
import type { Paginated, ScheduleSummary, AssignmentSummary } from '@portal/contracts';
import { useResource } from '../shared/use-resource';
import { ErrorNotice } from '../shared/error-notice';
import { Pagination } from '../shared/pagination';
import { frequencyLabels, assignmentLabels, localInstant } from './presentation';
import { AssignmentAction } from '../inspection-runner/assignment-action';
export function ScheduleList({ assignments = false }: { assignments?: boolean }) {
  const params = useSearchParams(),
    router = useRouter();
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
  const [q, setQ] = useState(params.get('q') ?? '');
  const [revision, setRevision] = useState(0);
  const state = Object.keys(assignmentLabels).includes(params.get('state') ?? '')
    ? params.get('state')!
    : '';
  const active = ['true', 'false'].includes(params.get('isActive') ?? '')
    ? params.get('isActive')!
    : '';
  const result = useResource<Paginated<ScheduleSummary | AssignmentSummary>>(
    `schedules${assignments ? '/assignments' : ''}?page=${page}&pageSize=10${assignments ? (state ? `&state=${state}` : '') : `&q=${encodeURIComponent((params.get('q') ?? '').slice(0, 120))}${active ? `&isActive=${active}` : ''}`}`,
    revision,
  );
  function navigate(p: number, filter = assignments ? state : active, query = q) {
    const next = new URLSearchParams();
    if (p > 1) next.set('page', String(p));
    if (filter) next.set(assignments ? 'state' : 'isActive', filter);
    if (!assignments && query.trim()) next.set('q', query.trim());
    router.replace(`/${assignments ? 'assignments' : 'schedules'}?${next}`, { scroll: false });
  }
  function search(event: FormEvent) {
    event.preventDefault();
    navigate(1);
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">OPERAÇÃO · INSPEÇÕES</span>
        <h1>{assignments ? 'Inspeções atribuídas' : 'Programações'}</h1>
        <p>
          {assignments
            ? 'Acompanhe ocorrências, responsáveis e prazos no seu escopo.'
            : 'Organize inspeções únicas ou recorrentes em unidades e tipos de inspeção autorizados.'}{' '}
          Horários de São Paulo.
        </p>
        {!assignments && (
          <a className="button primary" href="/schedules/new">
            Nova programação
          </a>
        )}
      </div>
      <section className="card list-card">
        <form className="filters" noValidate onSubmit={search}>
          {!assignments && (
            <>
              <Field id="schedule-search" label="Buscar programações">
                <Input
                  id="schedule-search"
                  value={q}
                  maxLength={120}
                  onChange={(event) => setQ(event.target.value)}
                />
              </Field>
              <Button type="submit">Buscar</Button>
            </>
          )}
          <div className="actions">
            <Button
              variant="secondary"
              disabled={result.loading}
              onClick={() => setRevision(revision + 1)}
            >
              Atualizar lista
            </Button>
          </div>
          <Field id="schedule-state" label="Situação">
            <Select
              id="schedule-state"
              value={assignments ? state : active}
              onChange={(event) => navigate(1, event.target.value)}
            >
              <option value="">Todas</option>
              {assignments ? (
                Object.entries(assignmentLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))
              ) : (
                <>
                  <option value="true">Ativas</option>
                  <option value="false">Pausadas</option>
                </>
              )}
            </Select>
          </Field>
        </form>
        {result.loading ? (
          <Skeleton />
        ) : result.error ? (
          <>
            <ErrorNotice error={result.error} />
            <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
              Tentar novamente
            </Button>
          </>
        ) : (
          result.data && (
            <>
              {!result.data.data.length ? (
                <div className="empty-state">
                  <h2>Nenhum resultado encontrado</h2>
                  <p>
                    {assignments
                      ? 'Não há atribuições nesta situação. As ocorrências são preparadas até sete dias à frente.'
                      : 'Crie uma programação ou ajuste os filtros.'}
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">
                      {assignments ? 'Inspeções atribuídas' : 'Programações de inspeção'}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Inspeção e escopo</th>
                        <th scope="col">Responsáveis</th>
                        <th scope="col">{assignments ? 'Ocorrência e prazo' : 'Recorrência'}</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.data.map((row) => (
                        <tr key={row.id}>
                          <td data-label="Inspeção e escopo">
                            <strong>{row.name}</strong>
                            <span className="cell-detail">
                              {row.unitName} · {row.sectorName}
                            </span>
                            {'formVersionNumber' in row && (
                              <span className="cell-detail">
                                Formulário · versão {row.formVersionNumber}
                              </span>
                            )}
                          </td>
                          <td data-label="Responsáveis">
                            {row.responsibles.map((user) => user.name).join(', ')}
                          </td>
                          <td data-label={assignments ? 'Ocorrência e prazo' : 'Recorrência'}>
                            {'occurrenceAt' in row ? (
                              <>
                                <time dateTime={row.occurrenceAt}>
                                  {localInstant(row.occurrenceAt)}
                                </time>
                                <span className="cell-detail">
                                  Prazo: {localInstant(row.dueAt)}
                                </span>
                              </>
                            ) : (
                              <>
                                {frequencyLabels[row.frequency]} · {row.time}
                                <span className="cell-detail">
                                  Próxima geração: {localInstant(row.nextOccurrenceAt)}
                                </span>
                              </>
                            )}
                          </td>
                          <td data-label="Situação">
                            {'inspectionState' in row && row.inspectionState && (
                              <span className="cell-detail">
                                {row.inspectionState === 'COMPLETED'
                                  ? 'Inspeção concluída'
                                  : 'Em preenchimento'}
                              </span>
                            )}
                            {'state' in row ? (
                              <span className={`badge ${row.state === 'OVERDUE' ? 'overdue' : ''}`}>
                                {assignmentLabels[row.state]}
                              </span>
                            ) : (
                              <>
                                <Badge active={row.isActive}>
                                  {row.isActive ? 'Ativa' : 'Pausada'}
                                </Badge>
                                {row.suspensionReason && (
                                  <span className="cell-detail">{row.suspensionReason}</span>
                                )}
                              </>
                            )}
                          </td>
                          {!assignments && (
                            <td data-label="Ações">
                              <a href={`/schedules/${row.id}`}>
                                Abrir<span className="sr-only"> {row.name}</span>
                              </a>
                            </td>
                          )}
                          {'occurrenceAt' in row && (
                            <td data-label="Ações">
                              <AssignmentAction assignment={row} />
                            </td>
                          )}
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
