'use client';
import { useEffect, useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Button, Field, Input, Notice, Select, Skeleton } from '@portal/ui';
import type { Paginated } from '@portal/contracts';
import { api } from '../../lib/api-client';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { ErrorNotice } from '../shared/error-notice';
import { Pagination } from '../shared/pagination';
import { useResource } from '../shared/use-resource';
import { resources, roleLabels, type AdminRow, type ResourceKind } from './config';
import { listDestination } from './list-destination';
export function ResourceList({ kind, ownId }: { kind: ResourceKind; ownId: string }) {
  const config = resources[kind];
  const router = useRouter();
  const params = useSearchParams();
  const returnQuery = encodeURIComponent(
    listDestination(kind, params.toString()).split('?')[1] ?? '',
  );
  const page = Math.max(1, Math.min(100000, Number(params.get('page')) || 1));
  const active = ['true', 'false'].includes(params.get('isActive') ?? '')
    ? params.get('isActive')!
    : '';
  const role = Object.keys(roleLabels).includes(params.get('role') ?? '')
    ? params.get('role')!
    : '';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [target, setTarget] = useState<AdminRow>();
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<unknown>();
  const [success, setSuccess] = useState('');
  function navigate(p: number, status = active, profile = role) {
    const next = new URLSearchParams();
    if (p > 1) next.set('page', String(p));
    if (status) next.set('isActive', status);
    if (kind === 'users' && profile) next.set('role', profile);
    router.replace(`/${kind}?${next}`, { scroll: false });
  }
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => {
      if (query !== search.trim()) {
        setQuery(search.trim());
        // Avoid replacing the current route while the user opens a row action.
        if (page !== 1) navigate(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [composing, query, search, page]);
  const path = `${config.endpoint}?pageSize=10&page=${page}&q=${encodeURIComponent(query)}${active ? `&isActive=${active}` : ''}${kind === 'users' && role ? `&role=${role}` : ''}`;
  const result = useResource<Paginated<AdminRow>>(path, revision);
  async function toggle() {
    if (!target || busy) return;
    setBusy(true);
    setMutationError(undefined);
    try {
      await api(`${config.endpoint}/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isActive: !target.isActive,
          ...(kind === 'customers' || kind === 'locations' ? { revision: target.revision } : {}),
        }),
      });
      if (kind === 'users' && target.id === ownId) {
        window.location.assign('/login');
        return;
      }
      setSuccess(`${target.name}: ${target.isActive ? 'desativado' : 'reativado'} com sucesso.`);
      setTarget(undefined);
      setRevision(revision + 1);
    } catch (error) {
      setMutationError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ADMINISTRAÇÃO</span>
        <h1>{config.title}</h1>
        <p>{config.description}</p>
        <a className="button primary" href={`/${kind}/new?return=${returnQuery}`}>
          {config.create}
        </a>
      </div>
      {success && <Notice>{success}</Notice>}
      {params.get('saved') === '1' && <Notice>Registro salvo com sucesso.</Notice>}
      <section className="card list-card" aria-label={`Lista de ${config.title.toLowerCase()}`}>
        <div className="filters">
          <Field
            id="list-search"
            label={kind === 'users' ? 'Buscar por nome ou e-mail' : 'Buscar por nome'}
          >
            <div className="search-input">
              <Input
                id="list-search"
                value={search}
                maxLength={120}
                onChange={(event) => setSearch(event.target.value)}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
              />
              <Button variant="secondary" disabled={!search} onClick={() => setSearch('')}>
                Limpar
              </Button>
            </div>
          </Field>
          <Field id="active-filter" label="Situação">
            <Select
              id="active-filter"
              value={active}
              onChange={(event) => navigate(1, event.target.value)}
            >
              <option value="">Todas</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </Select>
          </Field>
          {kind === 'users' && (
            <Field id="role-filter" label="Perfil">
              <Select
                id="role-filter"
                value={role}
                onChange={(event) => navigate(1, active, event.target.value)}
              >
                <option value="">Todos</option>
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
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
                  <h2>
                    {query || active || role
                      ? 'Nenhum resultado encontrado'
                      : 'Nenhum registro cadastrado'}
                  </h2>
                  <p>
                    {query || active || role
                      ? 'Ajuste a busca ou os filtros para continuar.'
                      : `Comece pelo botão ${config.create.toLowerCase()}.`}
                  </p>
                  {page > 1 && (
                    <Button variant="secondary" onClick={() => navigate(1)}>
                      Voltar à primeira página
                    </Button>
                  )}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">{config.title}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Nome</th>
                        {kind === 'users' && <th scope="col">Perfil</th>}
                        {kind === 'sectors' && <th scope="col">Unidade</th>}
                        {kind === 'customers' && <th scope="col">Unidades atendidas</th>}
                        {kind === 'locations' && <th scope="col">Cliente</th>}
                        <th scope="col">Situação</th>
                        <th scope="col">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.data.map((row) => (
                        <tr key={row.id}>
                          <td data-label="Nome">
                            <strong>{row.name}</strong>
                            {row.email && <span className="cell-detail">{row.email}</span>}
                          </td>
                          {kind === 'users' && (
                            <td data-label="Perfil">{row.role && roleLabels[row.role]}</td>
                          )}
                          {kind === 'sectors' && <td data-label="Unidade">{row.unitName}</td>}
                          {kind === 'customers' && (
                            <td data-label="Unidades atendidas">
                              {row.units?.map((u) => u.name).join(', ')}
                            </td>
                          )}
                          {kind === 'locations' && <td data-label="Cliente">{row.customerName}</td>}
                          <td data-label="Situação">
                            <Badge active={row.isActive} />
                            {row.mustChangePassword && (
                              <span className="cell-detail">Troca de senha pendente</span>
                            )}
                          </td>
                          <td data-label="Ações">
                            <div className="row-actions">
                              <a href={`/${kind}/${row.id}/edit?return=${returnQuery}`}>
                                Editar<span className="sr-only"> {row.name}</span>
                              </a>
                              {kind === 'users' && (
                                <>
                                  <a href={`/users/${row.id}/memberships`}>
                                    Vínculos<span className="sr-only"> de {row.name}</span>
                                  </a>
                                  <a href={`/users/${row.id}/reset-password?return=${returnQuery}`}>
                                    Redefinir senha<span className="sr-only"> de {row.name}</span>
                                  </a>
                                </>
                              )}
                              <button
                                className="text-button"
                                onClick={() => {
                                  setMutationError(undefined);
                                  setTarget(row);
                                }}
                              >
                                {row.isActive ? 'Desativar' : 'Reativar'}
                                <span className="sr-only"> {row.name}</span>
                              </button>
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
        open={!!target}
        title={`${target?.isActive ? 'Desativar' : 'Reativar'} ${config.singular}?`}
        busy={busy}
        danger={target?.isActive}
        confirmLabel={target?.isActive ? 'Desativar' : 'Reativar'}
        onCancel={() => setTarget(undefined)}
        onConfirm={toggle}
      >
        <p>
          <strong>{target?.name}</strong>
        </p>
        <p>
          {target?.isActive
            ? kind === 'users'
              ? 'A pessoa perderá o acesso e suas sessões serão encerradas. O histórico será preservado.'
              : 'Os acessos associados ficarão indisponíveis. O histórico e os vínculos serão preservados.'
            : 'O registro voltará a ficar ativo. Os vínculos continuam sujeitos à situação da unidade, do setor e do usuário.'}
        </p>
        {mutationError !== undefined && <ErrorNotice error={mutationError} />}
      </ConfirmDialog>
    </>
  );
}
