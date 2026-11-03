'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DefinitionIssue, FormTemplateSummary, FormVersionView } from '@portal/contracts';
import { Button, Notice, Skeleton } from '@portal/ui';
import { api, ApiError } from '../../lib/api-client';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { DirtyGuard } from '../shared/dirty-guard';
import { ErrorNotice } from '../shared/error-notice';
import { useResource } from '../shared/use-resource';
import { FormPreview } from '../form-preview/form-preview';
import { ContentEditor } from './content-editor';
import { DraftSession, type Draft } from './draft-session';
import { definitionIssues, stateLabels } from './model';
import { fieldId, IssueSummary } from './issue-summary';
import { VersionHistory } from './version-history';

export function Builder({ templateId }: { templateId: string }) {
  const [revision, setRevision] = useState(0);
  const metadata = useResource<FormTemplateSummary>(`forms/${templateId}`, revision);
  const draft = useResource<Draft>(
    metadata.data?.hasDraft && metadata.data.state !== 'ARCHIVED'
      ? `forms/${templateId}/draft`
      : null,
    revision,
  );
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'draft' | 'archive'>();
  const [error, setError] = useState<unknown>();
  async function begin() {
    if (!metadata.data || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(`forms/${templateId}/${confirm === 'archive' ? 'archive' : 'draft'}`, {
        method: 'POST',
        body: JSON.stringify({ revision: metadata.data.revision }),
      });
      setConfirm(undefined);
      setRevision(revision + 1);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  if (metadata.loading) return <Skeleton />;
  if (metadata.error)
    return (
      <>
        <ErrorNotice error={metadata.error} />
        <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
          Tentar novamente
        </Button>
      </>
    );
  const form = metadata.data!;
  if (form.hasDraft && form.state !== 'ARCHIVED') {
    if (draft.loading) return <Skeleton />;
    if (draft.error)
      return (
        <>
          <ErrorNotice error={draft.error} />
          <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
            Recarregar formulário
          </Button>
        </>
      );
    if (draft.data)
      return (
        <DraftEditor
          key={`${templateId}-${revision}`}
          form={form}
          initial={draft.data}
          onReload={() => setRevision(revision + 1)}
        />
      );
  }
  return (
    <>
      <div className="page-heading">
        <a className="back-link" href="/admin/forms">
          <span className="back-link-arrow" aria-hidden="true">
            ←
          </span>
          Formulários
        </a>
        <h1>{form.name}</h1>
        <p>
          {stateLabels[form.state]} ·{' '}
          {form.latestVersion ? `Versão atual ${form.latestVersion}` : 'Sem versão publicada'}
        </p>
      </div>
      {form.state === 'ARCHIVED' ? (
        <Notice>
          Modelo arquivado. As versões anteriores continuam disponíveis para consulta.
        </Notice>
      ) : (
        <section className="card">
          <h2>Versão publicada preservada</h2>
          <p>Para alterar o conteúdo, abra um novo rascunho baseado na versão atual.</p>
          <div className="actions">
            <Button onClick={() => setConfirm('draft')}>Criar novo rascunho</Button>
            <Button variant="secondary" onClick={() => setConfirm('archive')}>
              Arquivar modelo
            </Button>
          </div>
        </section>
      )}
      <VersionHistory key={revision} templateId={templateId} />
      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        title={confirm === 'archive' ? 'Arquivar este modelo?' : 'Criar novo rascunho?'}
        confirmLabel={confirm === 'archive' ? 'Arquivar' : 'Criar rascunho'}
        danger={confirm === 'archive'}
        onCancel={() => setConfirm(undefined)}
        onConfirm={begin}
      >
        <p>
          {confirm === 'archive'
            ? 'O modelo não poderá mais ser editado ou publicado. As versões anteriores serão preservadas.'
            : 'A versão publicada permanece disponível enquanto você edita a próxima.'}
        </p>
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
    </>
  );
}

function DraftEditor({
  form,
  initial,
  onReload,
}: {
  form: FormTemplateSummary;
  initial: Draft;
  onReload: () => void;
}) {
  const [session] = useState(
    () =>
      new DraftSession(initial, (revision, snapshot) =>
        api<Draft>(`forms/${form.id}/draft`, {
          method: 'PUT',
          body: JSON.stringify({ revision, snapshot }),
        }),
      ),
  );
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    session.connect();
    return () => session.dispose();
  }, [session]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [issues, setIssues] = useState<DefinitionIssue[]>([]);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [confirm, setConfirm] = useState<'publish' | 'archive' | 'reload'>();
  const blocked = state.status === 'conflict' || state.status === 'error';
  useEffect(() => {
    if (state.status === 'conflict') document.getElementById('builder-conflict-heading')?.focus();
  }, [state.status]);
  async function prepare(action: 'publish' | 'archive' | 'preview') {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!(await session.flush())) return;
      const errors = definitionIssues(session.getSnapshot().snapshot);
      if (action !== 'archive' && errors.length) {
        setIssues(errors);
        setMode('edit');
        queueMicrotask(() => document.getElementById(fieldId(errors[0]!.path))?.focus());
        return;
      }
      setIssues([]);
      if (action === 'preview') setMode('preview');
      else setConfirm(action);
    } finally {
      setBusy(false);
    }
  }
  async function perform() {
    if (busy || !confirm) return;
    if (confirm === 'reload') {
      onReload();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await api<FormVersionView>(`forms/${form.id}/${confirm}`, {
        method: 'POST',
        body: JSON.stringify({ revision: session.getSnapshot().revision }),
      });
      setConfirm(undefined);
      onReload();
    } catch (failure) {
      setError(failure);
      if (failure instanceof ApiError && failure.status === 400) {
        setIssues(failure.definitionErrors);
        setMode('edit');
        setConfirm(undefined);
      }
      if (failure instanceof ApiError && failure.status === 409) {
        setConfirm(undefined);
        session.markConflict(failure);
      }
    } finally {
      setBusy(false);
    }
  }
  const statusLabels = {
    saved: 'Rascunho salvo',
    dirty: 'Alterações não salvas',
    saving: 'Salvando rascunho…',
    error: 'Falha ao salvar',
    conflict: 'Conflito de edição',
  };
  return (
    <>
      <div className="page-heading">
        <a className="back-link" href="/admin/forms">
          <span className="back-link-arrow" aria-hidden="true">
            ←
          </span>
          Formulários
        </a>
        <span className="eyebrow">CONSTRUTOR · {stateLabels[form.state].toUpperCase()}</span>
        <h1>{form.name}</h1>
        <p>
          {form.latestVersion
            ? `Versão ${form.latestVersion} permanece publicada durante esta edição.`
            : 'Organize o conteúdo antes da primeira publicação.'}
        </p>
      </div>
      <div className="builder-toolbar">
        <p role="status">
          <strong>{statusLabels[state.status]}</strong>
          <span className="cell-detail">Revisão {state.revision}</span>
        </p>
        <div className="actions">
          <Button
            variant="secondary"
            disabled={busy || blocked || state.status === 'saving'}
            onClick={() => void session.flush()}
          >
            Salvar agora
          </Button>
          <Button
            variant="secondary"
            disabled={busy || blocked}
            onClick={() => (mode === 'preview' ? setMode('edit') : void prepare('preview'))}
          >
            {mode === 'preview' ? 'Editar conteúdo' : 'Pré-visualizar'}
          </Button>
          <Button disabled={busy || blocked} onClick={() => void prepare('publish')}>
            Publicar versão
          </Button>
          <Button
            variant="secondary"
            disabled={busy || blocked}
            onClick={() => void prepare('archive')}
          >
            Arquivar modelo
          </Button>
        </div>
      </div>
      {state.error !== undefined && <ErrorNotice error={state.error} />}{' '}
      {error !== undefined && !confirm && <ErrorNotice error={error} />}
      {state.status === 'error' && (
        <Button variant="secondary" onClick={() => void session.retry()}>
          Tentar salvar novamente
        </Button>
      )}
      {state.status === 'conflict' && (
        <section className="card conflict-panel">
          <h2 id="builder-conflict-heading" tabIndex={-1}>
            O formulário mudou em outra sessão
          </h2>
          <p>
            As gravações foram interrompidas. Seu conteúdo local continua abaixo. Copie o que deseja
            preservar antes de recarregar; nenhuma mesclagem será feita automaticamente.
          </p>
          <details>
            <summary>Ver conteúdo local para copiar</summary>
            <label htmlFor="local-snapshot">Conteúdo local (JSON)</label>
            <textarea
              className="resize-none"
              id="local-snapshot"
              readOnly
              value={JSON.stringify(state.snapshot, null, 2)}
              rows={10}
            />
          </details>
          <Button variant="secondary" onClick={() => setConfirm('reload')}>
            Recarregar dados atuais
          </Button>
        </section>
      )}
      <IssueSummary issues={issues} />
      {mode === 'edit' ? (
        <form
          noValidate
          method="post"
          className="card builder-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void session.flush();
          }}
          onCompositionStart={() => session.setComposing(true)}
          onCompositionEnd={() => session.setComposing(false)}
        >
          <fieldset disabled={busy || state.status === 'conflict'}>
            <ContentEditor
              key={state.status === 'conflict' ? 'conflict' : 'editing'}
              snapshot={state.snapshot}
              issues={issues}
              onError={(message) => setError(new Error(message))}
              onChange={(snapshot) => {
                setError(undefined);
                setIssues([]);
                session.edit(snapshot);
              }}
            />
          </fieldset>
        </form>
      ) : (
        <FormPreview snapshot={state.snapshot} templateId={form.id} revision={state.revision} />
      )}
      <DirtyGuard dirty={state.status !== 'saved'} busy={busy} />
      <VersionHistory templateId={form.id} />
      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        danger={confirm !== 'publish'}
        title={
          confirm === 'publish'
            ? 'Publicar nova versão?'
            : confirm === 'archive'
              ? 'Arquivar este modelo?'
              : 'Descartar conteúdo local e recarregar?'
        }
        confirmLabel={
          confirm === 'publish' ? 'Publicar' : confirm === 'archive' ? 'Arquivar' : 'Recarregar'
        }
        onCancel={() => {
          setConfirm(undefined);
          setError(undefined);
        }}
        onConfirm={() => void perform()}
      >
        <p>
          {confirm === 'publish'
            ? 'Uma cópia imutável deste conteúdo será criada. Alterações futuras exigirão outro rascunho.'
            : confirm === 'archive'
              ? 'O modelo não poderá mais ser editado ou publicado. Versões anteriores serão preservadas.'
              : 'Seu conteúdo local será descartado. Os dados atuais do servidor serão carregados.'}
        </p>
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
    </>
  );
}
