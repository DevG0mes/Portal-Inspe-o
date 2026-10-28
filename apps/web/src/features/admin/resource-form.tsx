'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Field, Input, Select, Skeleton } from '@portal/ui';
import { api } from '../../lib/api-client';
import { PasswordInput } from '../auth/auth-form';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { DirtyGuard } from '../shared/dirty-guard';
import { ErrorNotice } from '../shared/error-notice';
import { RemotePicker } from '../shared/remote-picker';
import { useResource } from '../shared/use-resource';
import { resources, roleLabels, type AdminRow, type ResourceKind } from './config';
import { listDestination } from './list-destination';
import { useHydrated } from '../shared/use-hydrated';
export function ResourceForm({
  kind,
  id,
  ownId,
  reset = false,
}: {
  kind: ResourceKind;
  id?: string;
  ownId: string;
  reset?: boolean;
}) {
  const config = resources[kind];
  const [revision, setRevision] = useState(0);
  const existing = useResource<AdminRow>(id ? `${config.endpoint}/${id}` : null, revision);
  // Mount the editable form only after its initial immutable snapshot is available.
  if (id && existing.loading) return <Skeleton />;
  if (id && existing.error)
    return (
      <>
        <ErrorNotice error={existing.error} />
        <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
          Tentar novamente
        </Button>
      </>
    );
  return (
    <Editor
      key={`${id ?? 'new'}-${revision}`}
      kind={kind}
      initial={existing.data}
      ownId={ownId}
      reset={reset}
    />
  );
}
function Editor({
  kind,
  initial,
  ownId,
  reset,
}: {
  kind: ResourceKind;
  initial?: AdminRow;
  ownId: string;
  reset: boolean;
}) {
  const config = resources[kind];
  const router = useRouter();
  const hydrated = useHydrated();
  const params = useSearchParams();
  const back = listDestination(kind, params.get('return'));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unitId, setUnitId] = useState('');
  const [pending, setPending] = useState<Record<string, unknown>>();
  async function save(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(
        `${config.endpoint}${initial ? `/${initial.id}${reset ? '/reset-password' : ''}` : ''}`,
        { method: initial && !reset ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      setDirty(false);
      if (
        initial?.id === ownId &&
        (reset ||
          (body.email !== undefined && body.email !== initial.email) ||
          (body.role !== undefined && body.role !== initial.role))
      ) {
        window.location.assign('/login');
        return;
      }
      setPending(undefined);
      router.push(listDestination(kind, params.get('return'), true));
      router.refresh();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const next: Record<string, string> = {};
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const body: Record<string, unknown> = {};
    if (reset) {
      if (password.length < 15) next.password = 'Use de 15 a 128 caracteres.';
      body.newPassword = password;
    } else {
      if (!name) next.name = 'Informe o nome.';
      if (!initial || name !== initial.name) body.name = name;
      if (kind === 'users') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Informe um e-mail válido.';
        if (!initial || email !== initial.email) body.email = email;
        if (!initial || data.get('role') !== initial.role) body.role = data.get('role');
        if (!initial) {
          if (password.length < 15) next.password = 'Use de 15 a 128 caracteres.';
          body.password = password;
        }
      }
      if (kind === 'sectors' && !initial) {
        if (!unitId) next.unitId = 'Selecione uma unidade.';
        body.unitId = unitId;
      }
    }
    setErrors(next);
    setError(undefined);
    const first = Object.keys(next)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    if (!Object.keys(body).length) {
      setDirty(false);
      router.push(back);
      return;
    }
    if (
      reset ||
      (kind === 'users' &&
        (initial ? body.role !== undefined || body.email !== undefined : body.role === 'ADMIN'))
    )
      setPending(body);
    else void save(body);
  }
  const title = reset ? 'Redefinir senha' : initial ? `Editar ${config.singular}` : config.create;
  return (
    <>
      <div className="page-heading">
        <Link href={back}>← {config.title}</Link>
        <h1>{title}</h1>
        {initial && <p>{initial.name}</p>}
      </div>
      <form
        className="card form-stack editor"
        method="post"
        onSubmit={submit}
        onChange={() => setDirty(true)}
        noValidate
        aria-busy={busy}
      >
        <fieldset disabled={busy || !hydrated}>
          {!reset && (
            <Field id="name" label="Nome" error={errors.name}>
              <Input
                id="name"
                name="name"
                defaultValue={initial?.name}
                maxLength={160}
                autoComplete={kind === 'users' ? 'name' : 'off'}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
            </Field>
          )}
          {kind === 'users' && !reset && (
            <>
              <Field id="email" label="E-mail" error={errors.email}>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  maxLength={254}
                  defaultValue={initial?.email}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                />
              </Field>
              <Field
                id="role"
                label="Perfil"
                hint="Administrador tem acesso global. Gestor e colaborador dependem dos vínculos definidos."
              >
                <Select id="role" name="role" defaultValue={initial?.role ?? 'COLLABORATOR'}>
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          {kind === 'users' && (!initial || reset) && (
            <Field
              id="password"
              label="Senha temporária"
              error={errors.password}
              hint="Use de 15 a 128 caracteres. A pessoa deverá alterar a senha no próximo acesso."
            >
              <PasswordInput
                id="password"
                autoComplete="new-password"
                error={errors.password}
                hint
              />
            </Field>
          )}
          {kind === 'sectors' &&
            (initial ? (
              <p>
                Unidade: <strong>{initial.unitName}</strong>. A unidade de um setor não pode ser
                alterada.
              </p>
            ) : (
              <RemotePicker
                id="unitId"
                label="Unidade"
                endpoint="organization/units"
                value={unitId}
                error={errors.unitId}
                onChange={(value) => {
                  setUnitId(value);
                  setDirty(true);
                }}
              />
            ))}
        </fieldset>
        {error !== undefined && !pending && <ErrorNotice error={error} />}
        <div className="actions">
          <Button type="submit" disabled={busy || !hydrated}>
            {busy ? 'Salvando…' : reset ? 'Redefinir senha' : 'Salvar'}
          </Button>
          <Link href={back} className="button secondary">
            Cancelar
          </Link>
        </div>
      </form>
      <DirtyGuard dirty={dirty} busy={busy} />
      <ConfirmDialog
        open={!!pending}
        title={reset ? 'Redefinir senha desta pessoa?' : 'Confirmar alteração de acesso?'}
        busy={busy}
        confirmLabel={reset ? 'Redefinir senha' : 'Confirmar alteração'}
        onCancel={() => {
          setPending(undefined);
          setError(undefined);
        }}
        onConfirm={() => {
          if (pending) void save(pending);
        }}
      >
        <p>{initial?.name ?? 'Novo administrador'}</p>
        <p>
          {reset
            ? 'Todas as sessões serão encerradas. Compartilhe a senha temporária por um canal seguro.'
            : 'Alterar e-mail ou perfil encerra as sessões existentes. Administradores têm acesso global ao portal.'}
        </p>
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
    </>
  );
}
