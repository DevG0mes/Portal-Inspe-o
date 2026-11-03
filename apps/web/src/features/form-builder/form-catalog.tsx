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
import { ConfirmDialog } from '../shared/confirm-dialog';
import { RemotePicker } from '../shared/remote-picker';
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
  const [createUnit, setCreateUnit] = useState(''),
    [createType, setCreateType] = useState('');
  const [error, setError] = useState<unknown>();
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<FormTemplateSummary>();
  const [bindingTarget, setBindingTarget] = useState<FormTemplateSummary>();
  const [unit, setUnit] = useState(''),
    [inspectionType, setInspectionType] = useState('');
  async function mutate(remove: boolean) {
    const target = remove ? removeTarget : bindingTarget;
    if (!target || busy) return;
    if (!remove && !inspectionType) {
      setError(new Error('Selecione uma unidade e um tipo de inspeção.'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api(`forms/${target.id}/${remove ? 'remove' : 'inspection-type'}`, {
        method: remove ? 'POST' : 'PUT',
        body: JSON.stringify({
          revision: target.revision,
          ...(!remove ? { inspectionTypeId: inspectionType } : {}),
        }),
      });
      setRemoveTarget(undefined);
      setBindingTarget(undefined);
      setRevision((r) => r + 1);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
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
        body: JSON.stringify({
          name: name.trim(),
          ...(createType ? { inspectionTypeId: createType } : {}),
        }),
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
            <RemotePicker
              id="create-form-unit"
              label="Unidade do modelo (opcional)"
              endpoint="organization/units"
              value={createUnit}
              onChange={(id) => {
                setCreateUnit(id);
                setCreateType('');
              }}
            />
            {createUnit && (
              <RemotePicker
                key={createUnit}
                id="create-form-type"
                label="Tipo de inspeção"
                endpoint={`organization/sectors?unitId=${createUnit}`}
                value={createType}
                onChange={(id) => setCreateType(id)}
              />
            )}
            <p>
              Você também pode criar o rascunho e usar “Vincular tipo” na lista antes de utilizá-lo.
            </p>
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
                            <span className="cell-detail">
                              {form.inspectionTypeName ?? 'Tipo ainda não vinculado'}
                            </span>
                          </td>
                          <td data-label="Estado">
                            {stateLabels[form.state]}
                            {form.hasDraft && form.state === 'PUBLISHED' && (
                              <span className="cell-detail">Novo rascunho em edição</span>
                            )}
                          </td>
                          <td data-label="Versão">{form.latestVersion || 'Ainda não publicado'}</td>
                          <td data-label="Ações">
                            <div className="actions">
                              <a href={`/admin/forms/${form.id}`}>
                                {form.state === 'ARCHIVED' ? 'Consultar' : 'Abrir editor'}
                                <span className="sr-only"> {form.name}</span>
                              </a>
                              {form.state !== 'ARCHIVED' && (
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    setUnit('');
                                    setInspectionType('');
                                    setError(undefined);
                                    setBindingTarget(form);
                                  }}
                                >
                                  Vincular tipo<span className="sr-only"> de {form.name}</span>
                                </Button>
                              )}
                              <Button
                                variant="danger"
                                onClick={() => {
                                  setError(undefined);
                                  setRemoveTarget(form);
                                }}
                              >
                                Excluir<span className="sr-only"> {form.name}</span>
                              </Button>
                            </div>
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
      <ConfirmDialog
        open={!!removeTarget}
        title="Excluir formulário?"
        confirmLabel="Excluir formulário"
        danger
        busy={busy}
        onCancel={() => setRemoveTarget(undefined)}
        onConfirm={() => void mutate(true)}
      >
        <p>
          Excluir “{removeTarget?.name}” do catálogo? Rascunhos nunca utilizados serão apagados.
          Versões publicadas e históricos serão preservados.
        </p>
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!bindingTarget}
        title="Vincular tipo de inspeção"
        confirmLabel="Salvar vínculo"
        busy={busy}
        onCancel={() => setBindingTarget(undefined)}
        onConfirm={() => void mutate(false)}
      >
        <p>Selecione o tipo para “{bindingTarget?.name}”. O histórico permanece preservado.</p>
        <RemotePicker
          id="form-binding-unit"
          label="Unidade"
          endpoint="organization/units"
          value={unit}
          onChange={(id) => {
            setUnit(id);
            setInspectionType('');
          }}
        />
        {unit && (
          <RemotePicker
            key={unit}
            id="form-binding-type"
            label="Tipo de inspeção"
            endpoint={`organization/sectors?unitId=${unit}`}
            value={inspectionType}
            onChange={(id) => setInspectionType(id)}
          />
        )}
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
    </>
  );
}
