'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { InspectionSummary, Paginated } from '@portal/contracts';
import { Button, Field, Select, Skeleton } from '@portal/ui';
import { useResource } from '../shared/use-resource';
import { ErrorNotice } from '../shared/error-notice';
import { Pagination } from '../shared/pagination';
import { localInstant } from '../schedules/presentation';
export function InspectionList() {
  const params = useSearchParams(),
    router = useRouter();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const state = ['DRAFT', 'COMPLETED'].includes(params.get('state') ?? '')
    ? params.get('state')!
    : '';
  const [revision, setRevision] = useState(0);
  const resource = useResource<Paginated<InspectionSummary>>(
    `inspections?page=${page}&pageSize=10${state ? `&state=${state}` : ''}`,
    revision,
  );
  function navigate(page: number, nextState = state) {
    const query = new URLSearchParams({ page: String(page) });
    if (nextState) query.set('state', nextState);
    router.replace(`/inspections?${query}`, { scroll: false });
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">OPERAÇÃO · REGISTROS</span>
        <h1>Inspeções</h1>
        <p>Continue um rascunho ou consulte o histórico das inspeções no seu escopo.</p>
        <a className="button primary" href="/inspections/start">
          Nova inspeção avulsa
        </a>
      </div>
      <section className="card list-card">
        <div className="filters">
          <Field id="inspection-state" label="Situação">
            <Select
              id="inspection-state"
              value={state}
              onChange={(event) => navigate(1, event.target.value)}
            >
              <option value="">Todas</option>
              <option value="DRAFT">Em preenchimento</option>
              <option value="COMPLETED">Concluídas</option>
            </Select>
          </Field>
          <Button
            variant="secondary"
            disabled={resource.loading}
            onClick={() => setRevision(revision + 1)}
          >
            Atualizar lista
          </Button>
        </div>
        {resource.loading ? (
          <Skeleton />
        ) : resource.error ? (
          <>
            <ErrorNotice error={resource.error} />
            <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
              Tentar novamente
            </Button>
          </>
        ) : (
          resource.data && (
            <>
              {!resource.data.data.length ? (
                <div className="empty-state">
                  <h2>Nenhuma inspeção encontrada</h2>
                  <p>Inicie uma inspeção avulsa ou consulte suas atribuições.</p>
                  <a href="/assignments">Ver atribuições</a>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Registros de inspeção</caption>
                    <thead>
                      <tr>
                        <th scope="col">Inspeção e escopo</th>
                        <th scope="col">Criada por</th>
                        <th scope="col">Última alteração</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resource.data.data.map((row) => (
                        <tr key={row.id}>
                          <td data-label="Inspeção e escopo">
                            <strong>{row.title}</strong>
                            <span className="cell-detail">
                              {row.unitName} · {row.sectorName}
                            </span>
                            <span className="cell-detail">
                              Formulário · versão {row.formVersionNumber}
                            </span>
                          </td>
                          <td data-label="Criada por">{row.createdByName}</td>
                          <td data-label="Última alteração">
                            <time dateTime={row.updatedAt}>{localInstant(row.updatedAt)}</time>
                          </td>
                          <td data-label="Situação">
                            <span className={`badge ${row.state === 'COMPLETED' ? 'active' : ''}`}>
                              {row.state === 'COMPLETED' ? 'Concluída' : 'Em preenchimento'}
                            </span>
                          </td>
                          <td data-label="Ações">
                            <a href={`/inspections/${row.id}`}>
                              Abrir<span className="sr-only"> {row.title}</span>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={page} pageSize={10} total={resource.data.total} onPage={navigate} />
            </>
          )
        )}
      </section>
    </>
  );
}
