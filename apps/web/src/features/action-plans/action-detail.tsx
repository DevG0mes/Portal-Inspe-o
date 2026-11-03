'use client';
import { useEffect, useRef, useState } from 'react';
import type {
  ActionPlanView,
  ActionCommandType,
  ActionPlanEventView,
  Paginated,
  EvidenceReceipt,
  EvidenceFile,
} from '@portal/contracts';
import { Button, Field, Input, Textarea, Select, Notice, Skeleton } from '@portal/ui';
import { api, ApiError } from '../../lib/api-client';
import { useResource } from '../shared/use-resource';
import { ErrorNotice } from '../shared/error-notice';
import { DirtyGuard } from '../shared/dirty-guard';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { RemotePicker } from '../shared/remote-picker';
import { Pagination } from '../shared/pagination';
import { EvidenceControls } from '../inspection-runner/evidence-controls';
import { EvidenceDownload } from '../inspection-runner/evidence-download';
import { localInstant } from '../schedules/presentation';
import { priorityLabels } from '../form-builder/model';
import { actionStates, eventLabels } from './presentation';
import { displayAnswer } from '../shared/answer-display';
export function ActionDetail({ id }: { id: string }) {
  const [reload, setReload] = useState(0),
    resource = useResource<ActionPlanView>(`action-plans/${id}`, reload);
  if (resource.loading) return <Skeleton />;
  if (resource.error)
    return (
      <>
        <ErrorNotice error={resource.error} />
        <Button onClick={() => setReload(reload + 1)}>Tentar novamente</Button>
      </>
    );
  return resource.data ? (
    <Workspace
      key={`${id}-${reload}`}
      initial={resource.data}
      onReload={() => setReload(reload + 1)}
    />
  ) : null;
}
function Workspace({ initial, onReload }: { initial: ActionPlanView; onReload: () => void }) {
  const [row, setRow] = useState(initial),
    [text, setText] = useState(''),
    [responsible, setResponsible] = useState(initial.responsibleId),
    [description, setDescription] = useState(initial.description),
    [date, setDate] = useState(initial.dueDate),
    [priority, setPriority] = useState(initial.priority);
  const [pending, setPending] = useState<Record<string, unknown>>(),
    [reloadConfirm, setReloadConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false),
    [error, setError] = useState<unknown>(),
    [fieldError, setFieldError] = useState(''),
    [historyPage, setHistoryPage] = useState(1),
    [selection, setSelection] = useState(false),
    [removing, setRemoving] = useState<EvidenceFile>();
  const history = useResource<Paginated<ActionPlanEventView>>(
    `action-plans/${row.id}/history?page=${historyPage}&pageSize=10`,
    row.revision,
  );
  const policy = useResource<import('@portal/contracts').UploadPolicy>('files/policy');
  const recovery = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (conflict) {
      if (pending || removing) {
        setPending(undefined);
        setRemoving(undefined);
      } else recovery.current?.focus();
    }
  }, [conflict, pending, removing]);
  const assignmentDirty =
    responsible !== row.responsibleId ||
    description !== row.description ||
    date !== row.dueDate ||
    priority !== row.priority;
  const dirty = !!text || assignmentDirty || selection;
  function failure(value: unknown) {
    setError(value);
    if (value instanceof ApiError && value.status === 409) setConflict(true);
  }
  function review(type: ActionCommandType) {
    if (busy || conflict) return;
    setError(undefined);
    setFieldError('');
    if (type === 'REQUEST_VALIDATION' && assignmentDirty) {
      setError(new Error('Salve a atribuição e o prazo antes de solicitar validação.'));
      return;
    }
    if (type === 'REQUEST_VALIDATION' && !row.evidence.some((file) => file.status === 'READY')) {
      setError(new Error('Anexe ao menos uma evidência de correção antes de solicitar validação.'));
      return;
    }
    if (
      type === 'REQUEST_VALIDATION' &&
      row.evidence.some(
        (file) => file.status !== 'READY' && Date.parse(file.expiresAt!) > Date.now(),
      )
    ) {
      setError(new Error('Finalize ou cancele os envios pendentes.'));
      return;
    }
    if (selection) {
      setError(new Error('Envie ou limpe a seleção de arquivo antes de continuar.'));
      return;
    }
    if (
      ['COMMENT', 'RETURN', 'REQUEST_VALIDATION'].includes(type) &&
      text.trim().length < (type === 'COMMENT' ? 1 : 5)
    ) {
      setFieldError('Descreva o registro com pelo menos 5 caracteres.');
      document.getElementById('action-text')?.focus();
      return;
    }
    if (type === 'ASSIGN' && (!responsible || description.trim().length < 5 || !date)) {
      setError(new Error('Informe responsável, descrição e prazo.'));
      return;
    }
    setPending({
      commandId: crypto.randomUUID(),
      revision: row.revision,
      type,
      ...(['COMMENT', 'RETURN', 'REQUEST_VALIDATION'].includes(type) ? { text: text.trim() } : {}),
      ...(type === 'ASSIGN'
        ? { responsibleId: responsible, description: description.trim(), dueDate: date, priority }
        : {}),
    });
  }
  async function send() {
    if (busy || !pending || conflict) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<ActionPlanView>(`action-plans/${row.id}/commands`, {
        method: 'POST',
        body: JSON.stringify(pending),
      });
      setRow(result);
      if (pending.type === 'ASSIGN') {
        setResponsible(result.responsibleId);
        setDescription(result.description);
        setDate(result.dueDate);
        setPriority(result.priority);
      }
      if (typeof pending.text === 'string') setText('');
      setHistoryPage(1);
      setPending(undefined);
    } catch (value) {
      failure(value);
    } finally {
      setBusy(false);
    }
  }
  async function beginEvidence() {
    if (busy || conflict || pending || removing) return undefined;
    setBusy(true);
    return row.revision;
  }
  function receipt(expected: number, result: EvidenceReceipt) {
    if (row.revision !== expected) {
      setConflict(true);
      return;
    }
    setRow((current) => ({ ...current, revision: result.revision, evidence: result.files }));
  }
  async function detach() {
    if (!removing || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<EvidenceReceipt>(`files/${removing.id}/detach`, {
        method: 'POST',
        body: JSON.stringify({ revision: row.revision }),
      });
      receipt(row.revision, result);
      setRemoving(undefined);
    } catch (value) {
      failure(value);
    } finally {
      setBusy(false);
    }
  }
  const sourceValue = displayAnswer(row.question, [
    { questionId: row.questionId, value: row.sourceAnswer },
  ]);
  return (
    <>
      <div className="page-heading">
        <a className="back-link" href="/action-plans">
          <span className="back-link-arrow" aria-hidden="true">
            ←
          </span>
          Planos de ação
        </a>
        <span className="eyebrow">CORREÇÃO · {row.category}</span>
        <h1>{row.description}</h1>
        <p>
          {row.unitName} · {row.sectorName}
        </p>
      </div>
      <section className="card">
        <div className="actions">
          <span className="badge">{actionStates[row.state]}</span>
          {row.overdue && <span className="badge overdue">Vencido</span>}
          <Button
            variant="secondary"
            disabled={busy || !!pending || !!removing}
            onClick={() => (dirty || conflict ? setReloadConfirm(true) : onReload())}
          >
            Atualizar plano
          </Button>
        </div>
        <p>
          Responsável: <strong>{row.responsibleName}</strong> · Prioridade{' '}
          {priorityLabels[row.priority].toLowerCase()}
        </p>
        <p>
          Prazo: <time dateTime={row.dueAt}>{localInstant(row.dueAt)}</time> · Revisão{' '}
          {row.revision}
        </p>
      </section>
      <section className="card">
        <h2>Ocorrência de origem</h2>
        <p>{row.inspectionTitle}</p>
        <dl className="inspection-record">
          <div>
            <dt>{row.question.label}</dt>
            <dd>{sourceValue}</dd>
            {row.sourceNote && <dd>Observação: {row.sourceNote}</dd>}
            {row.sourceEvidence.map((file) => (
              <dd key={file.id}>
                <EvidenceDownload file={file} />
              </dd>
            ))}
          </div>
        </dl>
      </section>
      {conflict && (
        <section
          className="card conflict-panel"
          ref={recovery}
          tabIndex={-1}
          aria-label="Recuperação do plano"
        >
          <Notice error>
            O plano foi alterado. Copie seu texto antes de recarregar; as alterações não serão
            mescladas.
          </Notice>
          <label htmlFor="action-copy">Conteúdo local para copiar</label>
          <Textarea
            id="action-copy"
            className="resize-none"
            rows={8}
            readOnly
            value={JSON.stringify({ text, description, responsible, date, priority }, null, 2)}
          />
          <Button variant="secondary" onClick={() => setReloadConfirm(true)}>
            Recarregar dados do plano
          </Button>
        </section>
      )}
      {error !== undefined && !pending && !removing && <ErrorNotice error={error} />}
      <fieldset disabled={busy || conflict || !!pending || !!removing}>
        {row.canExecute && row.state === 'OPEN' && (
          <section className="card">
            <h2>Iniciar a correção</h2>
            <p>Ao iniciar, a ação passa para em andamento e permite enviar evidências.</p>
            <Button onClick={() => review('START')}>Iniciar execução</Button>
          </section>
        )}
        <section className="card">
          <h2>Registro da correção</h2>
          <Field
            id="action-text"
            label="Comentário ou justificativa"
            error={fieldError}
            hint="Descreva o trabalho executado, a análise ou o motivo da devolução."
          >
            <Textarea
              id="action-text"
              className="resize-none"
              rows={4}
              value={text}
              maxLength={5000}
              aria-invalid={!!fieldError}
              aria-describedby={fieldError ? 'action-text-error' : 'action-text-hint'}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
          <div className="actions">
            <Button variant="secondary" onClick={() => review('COMMENT')}>
              Adicionar comentário
            </Button>
            {row.canExecute && row.state === 'IN_PROGRESS' && (
              <Button onClick={() => review('REQUEST_VALIDATION')}>Solicitar validação</Button>
            )}
            {row.canManage && row.state === 'AWAITING_VALIDATION' && (
              <>
                <Button onClick={() => review('APPROVE')}>Aprovar correção</Button>
                <Button variant="secondary" onClick={() => review('RETURN')}>
                  Devolver com justificativa
                </Button>
              </>
            )}
          </div>
        </section>
        <section className="card">
          <h2>Evidências de correção</h2>
          {row.canExecute && row.state === 'IN_PROGRESS' ? (
            <>
              <EvidenceControls
                actionPlanId={row.id}
                questionId={row.questionId}
                questionLabel="Correção"
                files={row.evidence}
                policy={policy.data}
                onBegin={beginEvidence}
                onEnd={() => setBusy(false)}
                onPending={(file) =>
                  setRow((current) => ({
                    ...current,
                    evidence: [...current.evidence.filter((item) => item.id !== file.id), file],
                  }))
                }
                onReceipt={receipt}
                onRemove={setRemoving}
                onFailure={failure}
                onSelection={setSelection}
              />
              {policy.error && <ErrorNotice error={policy.error} />}
            </>
          ) : row.evidence.filter((file) => file.status === 'READY').length ? (
            row.evidence
              .filter((file) => file.status === 'READY')
              .map((file) => <EvidenceDownload key={file.id} file={file} />)
          ) : (
            <p>Nenhuma evidência de correção finalizada.</p>
          )}
        </section>
        {row.canManage && ['OPEN', 'IN_PROGRESS'].includes(row.state) && (
          <section className="card editor">
            <h2>Atribuição e prazo</h2>
            <Field id="action-description" label="Descrição da correção">
              <Textarea
                id="action-description"
                className="resize-none"
                maxLength={5000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <RemotePicker
              id="action-responsible"
              label="Responsável"
              endpoint={`schedules/candidates?purpose=correction&unitId=${row.unitId}&sectorId=${row.sectorId}`}
              activeOnly={false}
              value={responsible}
              onChange={setResponsible}
            />
            <Field id="action-date" label="Prazo da correção">
              <Input
                id="action-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field id="action-priority" label="Prioridade">
              <Select
                id="action-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as typeof priority)}
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button disabled={!assignmentDirty} onClick={() => review('ASSIGN')}>
              Salvar atribuição
            </Button>
          </section>
        )}
      </fieldset>
      <section className="card">
        <h2>Histórico do plano</h2>
        <p className="muted">Mais recentes primeiro. Os registros anteriores são preservados.</p>
        {history.loading ? (
          <Skeleton />
        ) : history.error ? (
          <ErrorNotice error={history.error} />
        ) : (
          history.data && (
            <>
              <ol className="action-timeline">
                {history.data.data.map((event) => (
                  <li key={event.id}>
                    <strong>{eventLabels[event.type] ?? event.type}</strong>
                    <span className="cell-detail">
                      {event.actorName} ·{' '}
                      <time dateTime={event.createdAt}>{localInstant(event.createdAt)}</time>
                    </span>
                    <span className="cell-detail">
                      {event.fromState ? `${actionStates[event.fromState]} → ` : ''}
                      {actionStates[event.toState]}
                    </span>
                    {event.text && <p>{event.text}</p>}
                    {event.assignment && (
                      <p>
                        Responsável: {event.assignment.responsibleName} · Prazo:{' '}
                        {event.assignment.dueDate.split('-').reverse().join('/')} · Prioridade{' '}
                        {priorityLabels[event.assignment.priority].toLowerCase()}
                      </p>
                    )}
                    {event.evidence.map((file) => (
                      <EvidenceDownload key={file.id} file={file} />
                    ))}
                  </li>
                ))}
              </ol>
              <Pagination
                page={historyPage}
                pageSize={10}
                total={history.data.total}
                onPage={setHistoryPage}
              />
            </>
          )
        )}
      </section>
      <ConfirmDialog
        open={!!pending}
        busy={busy}
        title={eventLabels[String(pending?.type)] ?? 'Confirmar operação'}
        confirmLabel="Confirmar operação"
        danger={pending?.type === 'RETURN'}
        onCancel={() => setPending(undefined)}
        onConfirm={send}
      >
        <p>A operação ficará registrada no histórico deste plano.</p>
        {typeof pending?.text === 'string' && <p>{pending.text}</p>}
        {pending && error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!removing}
        busy={busy}
        title="Remover evidência da correção?"
        confirmLabel="Remover evidência"
        danger
        onCancel={() => setRemoving(undefined)}
        onConfirm={detach}
      >
        <p>O vínculo atual será removido; solicitações anteriores continuam preservadas.</p>
        {removing && error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
      <ConfirmDialog
        open={reloadConfirm}
        title="Descartar conteúdo local?"
        confirmLabel="Descartar e recarregar"
        danger
        onCancel={() => setReloadConfirm(false)}
        onConfirm={onReload}
      >
        <p>O texto e a seleção ainda não enviados serão descartados.</p>
      </ConfirmDialog>
      <DirtyGuard dirty={dirty} busy={busy || !!pending || !!removing} />
    </>
  );
}
