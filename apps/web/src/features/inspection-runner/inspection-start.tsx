'use client';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Skeleton } from '@portal/ui';
import type { Paginated, UnitSummary } from '@portal/contracts';
import { useResource } from '../shared/use-resource';
import { ErrorNotice } from '../shared/error-notice';
import { Pagination } from '../shared/pagination';
export function InspectionStart() {
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const result = useResource<Paginated<UnitSummary>>(
    `organization/units?isActive=true&pageSize=10&page=${page}&q=${encodeURIComponent(query)}`,
    revision,
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    setQuery(search.trim());
    setPage(1);
  }
  return (
    <>
      <div className="page-heading">
        <a className="back-link" href="/inspections">
          <span className="back-link-arrow" aria-hidden="true">
            ←
          </span>
          Inspeções
        </a>
        <span className="eyebrow">NOVA INSPEÇÃO</span>
        <h1>Escolha a unidade de negócio</h1>
        <p>Depois, identifique cliente, local e participantes e escolha a ficha de inspeção.</p>
      </div>
      <form className="filters" noValidate onSubmit={submit}>
        <Field id="start-unit-search" label="Buscar unidade">
          <Input
            id="start-unit-search"
            maxLength={120}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Button type="submit">Buscar</Button>
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
        <>
          <div className="summary-grid">
            {result.data?.data.map((unit) => (
              <a
                className="card unit-choice"
                key={unit.id}
                href={`/inspections/new?unitId=${unit.id}`}
              >
                <h2>{unit.name}</h2>
                <span>Continuar com esta unidade →</span>
              </a>
            ))}
          </div>
          {!result.data?.total && (
            <div className="empty-state">
              <h2>Nenhuma unidade disponível</h2>
              <p>
                Solicite ao administrador o cadastro ou vínculo com a unidade e seu tipo de
                inspeção.
              </p>
            </div>
          )}
          <Pagination page={page} pageSize={10} total={result.data?.total ?? 0} onPage={setPage} />
        </>
      )}
    </>
  );
}
