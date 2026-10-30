'use client';
import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { FormTemplateSummary, Paginated } from '@portal/contracts';
import { Button, Field, Input, Select, Skeleton } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ErrorNotice } from '../shared/error-notice';
import { Pagination } from '../shared/pagination';
import { useResource } from '../shared/use-resource';
import { useHydrated } from '../shared/use-hydrated';
import { stateLabels } from './model';
export function FormCatalog() {
  const params = useSearchParams();
  const router = useRouter();
  const hydrated = useHydrated();
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
  const q = (params.get('q') ?? '').slice(0, 120);
  const state = Object.keys(stateLabels).includes(params.get('state') ?? '')
    ? params.get('state')!
    : '';
  const [search, setSearch] = useState(q);
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>();
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState(false);
  const result = useResource<Paginated<FormTemplateSummary>>(
    `forms?pageSize=10&page=${page}&q=${encodeURIComponent(q)}${state ? `&state=${state}` : ''}`,
    revision,
  );
  function navigate(p: number, query = q, status = state) {
    const next = new URLSearchParams();
    if (p > 1) next.set('page', String(p));
    if (query) next.set('q', query);
    if (status) next.set('state', status);
    router.replace(`/admin/forms?${next}`, { scroll: false });
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setNameError('Informe o nome do modelo.');
      document.getElementById('form-name')?.focus();
      return;
    }
    setNameError('');
    setError(undefined);
    setBusy(true);
    try {
      const created = await api<FormTemplateSummary>('forms', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      window.location.assign(`/admin/forms/${created.id}`);
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ADMINISTRAÇÃO · MODELOS</span>
        <h1>Formulários</h1>
        <p>Organize as perguntas da inspeção e publique versões para uso em campo.</p>
        <a className="button secondary" href="/admin/forms/import">
          Importar CSV
        </a>
      </div>
      <section className="card create-form">
        <h2>Novo modelo</h2>
        <form method="post" noValidate onSubmit={create} aria-busy={busy}>
          <fieldset disabled={busy || !hydrated}>
            <Field id="form-name" label="Nome do modelo" error={nameError}>
              <Input
                id="form-name"
                value={name}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'form-name-error' : undefined}
              />
            </Field>
            <Button type="submit" disabled={busy || !hydrated}>
              {busy ? 'Criando…' : 'Criar formulário'}
            </Button>
          </fieldset>
          {error !== undefined && <ErrorNotice error={error} />}
        </form>
      </section>
      <section className="card list-card">
        <form
          className="filters"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            navigate(1, search.trim());
          }}
        >
          <Field id="forms-search" label="Buscar modelos">
            <Input
              id="forms-search"
              value={search}
              maxLength={120}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <Button type="submit">Buscar</Button>
          <Field id="forms-state" label="Estado">
            <Select
              id="forms-state"
              value={state}
              onChange={(event) => navigate(1, q, event.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(stateLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
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
                  <h2>{q || state ? 'Nenhum resultado encontrado' : 'Nenhum formulário criado'}</h2>
                  <p>
                    {q || state
                      ? 'Ajuste a busca e o estado.'
                      : 'Crie um modelo para começar a montar a ficha de inspeção.'}
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Modelos de formulário</caption>
                    <thead>
                      <tr>
                        <th scope="col">Modelo</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Versão</th>
                        <th scope="col">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.data.map((form) => (
                        <tr key={form.id}>
                          <td data-label="Modelo">
                            <strong>{form.name}</strong>
                          </td>
                          <td data-label="Estado">
                            {stateLabels[form.state]}
                            {form.hasDraft && form.state === 'PUBLISHED' && (
                              <span className="cell-detail">Novo rascunho em edição</span>
                            )}
                          </td>
                          <td data-label="Versão">{form.latestVersion || 'Ainda não publicado'}</td>
                          <td data-label="Ações">
                            <a href={`/admin/forms/${form.id}`}>
                              {form.state === 'ARCHIVED' ? 'Consultar' : 'Abrir editor'}
                              <span className="sr-only"> {form.name}</span>
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
