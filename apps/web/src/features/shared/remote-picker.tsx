'use client';
import { useState } from 'react';
import { Button, Field, Input, Select, Skeleton } from '@portal/ui';
import type { Paginated, UnitSummary } from '@portal/contracts';
import { useResource } from './use-resource';
import { ErrorNotice } from './error-notice';
import { Pagination } from './pagination';
/** Explicit search and pagination avoid hidden limits on organization choices. */
export function RemotePicker({
  id,
  label,
  endpoint,
  value,
  onChange,
  error,
  disabled,
  activeOnly = true,
}: {
  id: string;
  label: string;
  endpoint: string;
  value: string;
  onChange: (id: string, name: string) => void;
  error?: string;
  disabled?: boolean;
  activeOnly?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedName, setSelectedName] = useState('');
  const [revision, setRevision] = useState(0);
  const resource = useResource<Paginated<UnitSummary>>(
    `${endpoint}${endpoint.includes('?') ? '&' : '?'}${activeOnly ? 'isActive=true&' : ''}pageSize=10&page=${page}&q=${encodeURIComponent(search)}`,
    revision,
  );
  const rows = resource.data?.data ?? [];
  return (
    <fieldset className="picker" disabled={disabled}>
      <legend>{label}</legend>
      <div className="picker-search">
        <label className="sr-only" htmlFor={`${id}-search`}>
          Buscar {label.toLowerCase()}
        </label>
        <Input
          id={`${id}-search`}
          value={query}
          maxLength={120}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setSearch(query.trim());
            setPage(1);
          }}
        >
          Buscar
        </Button>
      </div>
      {resource.loading ? (
        <Skeleton />
      ) : resource.error ? (
        <>
          <ErrorNotice error={resource.error} />
          <Button type="button" variant="secondary" onClick={() => setRevision(revision + 1)}>
            Tentar novamente
          </Button>
        </>
      ) : (
        <>
          <Field id={id} label={`Selecionar ${label.toLowerCase()}`} error={error}>
            <Select
              id={id}
              value={value}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                const name = rows.find((row) => row.id === event.target.value)?.name ?? '';
                setSelectedName(name);
                onChange(event.target.value, name);
              }}
            >
              <option value="">Selecione…</option>
              {value && !rows.some((row) => row.id === value) && (
                <option value={value}>{selectedName || 'Seleção atual'}</option>
              )}
              {rows.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.name}
                </option>
              ))}
            </Select>
          </Field>
          {!rows.length && <p>Nenhum resultado. Ajuste a busca.</p>}
          <Pagination
            page={page}
            pageSize={10}
            total={resource.data?.total ?? 0}
            onPage={setPage}
          />
        </>
      )}
    </fieldset>
  );
}
