'use client';
import { useState, type FormEvent } from 'react';
import type { ScheduleSummary } from '@portal/contracts';
import { Button, Field, Input, Notice, Skeleton } from '@portal/ui';
import { api } from '../../lib/api-client';
import { useResource } from '../shared/use-resource';
import { DirtyGuard } from '../shared/dirty-guard';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { ErrorNotice } from '../shared/error-notice';
import { frequencyLabels, localInstant } from './presentation';
export function ScheduleDetail({ id }: { id: string }) {
  const [revision, setRevision] = useState(0);
  const resource = useResource<ScheduleSummary>(`schedules/${id}`, revision);
  if (resource.loading) return <Skeleton />;
  if (resource.error)
    return (
      <>
        <ErrorNotice error={resource.error} />
        <Button variant="secondary" onClick={() => setRevision(revision + 1)}>
          Tentar novamente
        </Button>
      </>
    );
  return <Editor key={revision} data={resource.data!} reload={() => setRevision(revision + 1)} />;
}
function Editor({ data, reload }: { data: ScheduleSummary; reload: () => void }) {
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [confirm, setConfirm] = useState(false),
    [refresh, setRefresh] = useState(false);
  const [error, setError] = useState<unknown>();
  const [nameError, setNameError] = useState('');
  async function save(body: object) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(`schedules/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: data.revision, ...body }),
      });
      setDirty(false);
      setConfirm(false);
      reload();
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }
  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();
    if (!name) {
      setNameError('Informe o nome.');
      document.getElementById('schedule-name')?.focus();
      return;
    }
    if (name === data.name) {
      setDirty(false);
      return;
    }
    void save({ name });
  }
  return (
    <>
      <div className="page-heading">
        <a href="/schedules">← Programações</a>
        <h1>{data.name}</h1>
        <p>
          {data.isActive ? 'Ativa' : 'Pausada'} · Revisão {data.revision}
        </p>
      </div>
      {data.suspensionReason && (
        <Notice error>Programação suspensa: {data.suspensionReason}</Notice>
      )}
      <section className="card">
        <h2>Configuração</h2>
        <dl className="schedule-summary">
          <dt>Unidade e setor</dt>
          <dd>
            {data.unitName} · {data.sectorName}
          </dd>
          <dt>Formulário</dt>
          <dd>{data.formName}</dd>
          <dt>Calendário</dt>
          <dd>
            {frequencyLabels[data.frequency]} · {data.startDate} às {data.time} · São Paulo
            {data.endDate ? ` · Até ${data.endDate}` : ''}
          </dd>
          <dt>Prazo</dt>
          <dd>{data.deadlineHours} horas corridas</dd>
          <dt>Responsáveis</dt>
          <dd>{data.responsibles.map((user) => user.name).join(', ')}</dd>
          <dt>Próxima geração</dt>
          <dd>{localInstant(data.nextOccurrenceAt)}</dd>
        </dl>
        <p className="muted small">
          Para mudar calendário, formulário ou responsáveis, pause esta programação e crie outra. O
          histórico permanece preservado.
        </p>
        <div className="actions">
          <Button variant="secondary" disabled={busy || dirty} onClick={() => setConfirm(true)}>
            {data.isActive ? 'Pausar programação' : 'Retomar programação'}
          </Button>
          {dirty && <p className="small muted">Salve o nome antes de alterar a situação.</p>}
          <a href="/assignments">Ver atribuições</a>
        </div>
      </section>
      <form
        className="card editor"
        method="post"
        noValidate
        onSubmit={rename}
        onChange={() => setDirty(true)}
      >
        <h2>Nome da programação</h2>
        <Field id="schedule-name" label="Nome" error={nameError}>
          <Input
            id="schedule-name"
            name="name"
            defaultValue={data.name}
            maxLength={160}
            disabled={busy}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'schedule-name-error' : undefined}
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar nome'}
        </Button>
      </form>
      {error !== undefined && !confirm && (
        <>
          <ErrorNotice error={error} />
          <Button variant="secondary" onClick={() => setRefresh(true)}>
            Recarregar dados atuais
          </Button>
        </>
      )}
      <DirtyGuard dirty={dirty} busy={busy} />
      <ConfirmDialog
        open={confirm}
        busy={busy}
        title={data.isActive ? 'Pausar esta programação?' : 'Retomar esta programação?'}
        confirmLabel={data.isActive ? 'Pausar' : 'Retomar'}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void save({ isActive: !data.isActive })}
      >
        <p>
          {data.isActive
            ? 'As ocorrências futuras planejadas serão canceladas. Pendências anteriores permanecem.'
            : 'O calendário volta a gerar ocorrências a partir do momento atual. Formulário, escopo e responsáveis serão revalidados.'}
        </p>
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
      <ConfirmDialog
        open={refresh}
        title="Recarregar e descartar alterações locais?"
        confirmLabel="Recarregar"
        onCancel={() => setRefresh(false)}
        onConfirm={reload}
      >
        <p>
          Confira o estado atual antes de tentar outra alteração. O nome ainda não salvo será
          descartado.
        </p>
      </ConfirmDialog>
    </>
  );
}
