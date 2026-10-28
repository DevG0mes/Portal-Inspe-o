'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AnswerInput, InspectionView } from '@portal/contracts';
import { RuleEngine } from '@portal/form-engine';
import { Button, Notice, Skeleton } from '@portal/ui';
import { api, ApiError } from '../../lib/api-client';
import { useResource } from '../shared/use-resource';
import { useHydrated } from '../shared/use-hydrated';
import { DraftSession } from '../shared/draft-session';
import { DirtyGuard } from '../shared/dirty-guard';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { ErrorNotice } from '../shared/error-notice';
import { QuestionField } from '../shared/question-field';
import { InspectionRecord } from './inspection-record';

export function InspectionRunner({ inspectionId }: { inspectionId: string }) {
  const [revision, setRevision] = useState(0);
  const resource = useResource<InspectionView>(`inspections/${inspectionId}`, revision);
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
  if (!resource.data) return null;
  return (
    <InspectionWorkspace
      key={`${inspectionId}-${revision}`}
      initial={resource.data}
      onReload={() => setRevision(revision + 1)}
    />
  );
}

function InspectionWorkspace({
  initial,
  onReload,
}: {
  initial: InspectionView;
  onReload: () => void;
}) {
  const [row, setRow] = useState(initial);
  return (
    <>
      <div className="page-heading">
        <a href="/inspections">← Inspeções</a>
        <span className="eyebrow">
          {row.assignmentId ? 'INSPEÇÃO ATRIBUÍDA' : 'INSPEÇÃO AVULSA'}
        </span>
        <h1>{row.snapshot.title}</h1>
        <p>
          Formulário · versão {row.formVersionNumber} · Ciclo {row.cycle}
        </p>
      </div>
      {row.state === 'DRAFT' && row.canEdit ? (
        <DraftRunner key={row.cycle} initial={row} onCompleted={setRow} onReload={onReload} />
      ) : (
        <InspectionRecord
          key={`${row.state}-${row.cycle}`}
          row={row}
          onReopened={setRow}
          onReload={onReload}
        />
      )}
    </>
  );
}

const saveLabels = {
  saved: 'Respostas salvas',
  dirty: 'Alterações aguardando salvamento',
  saving: 'Salvando respostas…',
  error: 'Falha ao salvar',
  conflict: 'Conflito de edição',
};
function DraftRunner({
  initial,
  onCompleted,
  onReload,
}: {
  initial: InspectionView;
  onCompleted: (row: InspectionView) => void;
  onReload: () => void;
}) {
  const hydrated = useHydrated();
  const [session] = useState(
    () =>
      new DraftSession<AnswerInput[]>(
        { revision: initial.revision, snapshot: initial.answers },
        async (revision, answers) => {
          const receipt = await api<InspectionView>(`inspections/${initial.id}/draft`, {
            method: 'PUT',
            body: JSON.stringify({ revision, answers }),
          });
          return { revision: receipt.revision, snapshot: receipt.answers };
        },
      ),
  );
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    session.connect();
    return () => session.dispose();
  }, [session]);
  const [confirm, setConfirm] = useState<'complete' | 'reload'>(),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState<unknown>();
  const conflictRef = useRef<HTMLDivElement>(null);
  const [focusTarget, setFocusTarget] = useState<string>();
  useEffect(() => {
    if (!busy && focusTarget) {
      document.getElementById(focusTarget)?.focus();
      setFocusTarget(undefined);
    }
  }, [busy, focusTarget]);
  useEffect(() => {
    if (state.status === 'conflict') {
      setConfirm(undefined);
      conflictRef.current?.focus();
    }
  }, [state.status]);
  const result = new RuleEngine().evaluate(initial.snapshot, state.snapshot);
  const answered = result.acceptedAnswers.filter(
    (answer) => answer.value !== null && answer.value !== '',
  ).length;
  const conflict = state.status === 'conflict';
  async function review() {
    if (busy || conflict) return;
    setBusy(true);
    setError(undefined);
    setAttempted(true);
    try {
      if (!(await session.flush())) return;
      const checked = new RuleEngine().evaluate(initial.snapshot, session.getSnapshot().snapshot);
      if (checked.errors.length || checked.definitionErrors.length) {
        const first = checked.errors[0];
        if (first) setFocusTarget(`answer-${first.questionId}`);
        return;
      }
      setConfirm('complete');
    } finally {
      setBusy(false);
    }
  }
  async function complete() {
    if (busy || conflict) return;
    setBusy(true);
    setError(undefined);
    try {
      const row = await api<InspectionView>(`inspections/${initial.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ revision: session.getSnapshot().revision, cycle: initial.cycle }),
      });
      onCompleted(row);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) session.markConflict(failure);
      else setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card inspection-status" aria-label="Progresso do preenchimento">
        <div>
          <strong>
            {answered} de {result.visibleQuestionIds.length} perguntas respondidas
          </strong>
          <progress
            aria-label="Perguntas respondidas"
            value={answered}
            max={Math.max(1, result.visibleQuestionIds.length)}
          />
        </div>
        <p role="status">
          {saveLabels[state.status]} · Revisão {state.revision}
        </p>
        <p className="muted">
          Mantenha esta página aberta até confirmar o salvamento. As respostas ainda não salvas
          ficam somente nesta aba.
        </p>
      </section>
      {state.status === 'error' && (
        <section className="card">
          <ErrorNotice error={state.error} />
          <p>Suas respostas continuam nesta aba. Verifique a conexão e tente salvar novamente.</p>
          <Button
            onClick={() => {
              void session.retry();
            }}
          >
            Tentar salvar novamente
          </Button>
        </section>
      )}
      {conflict && (
        <section
          className="card conflict-panel"
          ref={conflictRef}
          tabIndex={-1}
          aria-label="Recuperação de conflito"
        >
          <Notice error>
            Esta inspeção foi alterada em outra aba ou por outra pessoa. O salvamento foi
            interrompido.
          </Notice>
          <p>Copie suas respostas antes de recarregar. Elas não serão mescladas automaticamente.</p>
          <label htmlFor="inspection-local-copy">Respostas locais para copiar</label>
          <textarea
            className="resize-none"
            rows={10}
            id="inspection-local-copy"
            readOnly
            value={JSON.stringify(
              {
                inspectionId: initial.id,
                cycle: initial.cycle,
                revision: state.revision,
                answers: state.snapshot,
              },
              null,
              2,
            )}
          />
          <Button variant="secondary" onClick={() => setConfirm('reload')}>
            Recarregar inspeção
          </Button>
        </section>
      )}
      {attempted && result.errors.length > 0 && (
        <Notice error>
          Revise {result.errors.length} resposta(s) antes de concluir. Os campos estão identificados
          abaixo.
        </Notice>
      )}
      <form
        noValidate
        method="post"
        className="inspection-questions"
        onSubmit={(event) => {
          event.preventDefault();
          void review();
        }}
        onCompositionStart={() => session.setComposing(true)}
        onCompositionEnd={() => session.setComposing(false)}
      >
        <fieldset disabled={!hydrated || busy || !!confirm || conflict}>
          {initial.snapshot.sections.map((section, index) => {
            const questions = section.questions.filter((question) =>
              result.visibleQuestionIds.includes(question.id),
            );
            return (
              questions.length > 0 && (
                <section className="card preview-section" key={section.id}>
                  <h2>
                    {index + 1}. {section.title}
                  </h2>
                  {questions.map((question) => {
                    const issue =
                      attempted && result.errors.find((issue) => issue.questionId === question.id);
                    return (
                      <QuestionField
                        key={question.id}
                        id={`answer-${question.id}`}
                        question={question}
                        value={
                          state.snapshot.find((answer) => answer.questionId === question.id)
                            ?.value ?? null
                        }
                        error={
                          issue
                            ? issue.code === 'REQUIRED'
                              ? 'Resposta obrigatória.'
                              : 'Confira o valor informado.'
                            : undefined
                        }
                        onChange={(value) => {
                          setError(undefined);
                          session.edit([
                            ...session
                              .getSnapshot()
                              .snapshot.filter((answer) => answer.questionId !== question.id),
                            { questionId: question.id, value },
                          ]);
                        }}
                      />
                    );
                  })}
                </section>
              )
            );
          })}
          <div className="card actions">
            <Button type="submit" disabled={state.status === 'error'}>
              Revisar e concluir
            </Button>
            <Button
              variant="secondary"
              disabled={state.status === 'saved' || state.status === 'error'}
              onClick={() => {
                void session.flush();
              }}
            >
              Salvar agora
            </Button>
          </div>
        </fieldset>
      </form>
      {initial.submissions.length > 0 && (
        <details className="inspection-history">
          <summary>Consultar conclusões anteriores ({initial.submissions.length})</summary>
          <InspectionRecord row={initial} historyOnly />
        </details>
      )}
      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        title={confirm === 'reload' ? 'Descartar respostas locais?' : 'Concluir esta inspeção?'}
        confirmLabel={confirm === 'reload' ? 'Descartar e recarregar' : 'Concluir inspeção'}
        danger={confirm === 'reload'}
        onCancel={() => setConfirm(undefined)}
        onConfirm={confirm === 'reload' ? onReload : complete}
      >
        {confirm === 'reload' ? (
          <p>
            As respostas desta aba serão descartadas e substituídas pelas que estão salvas no
            servidor.
          </p>
        ) : (
          <p>
            A conclusão preserva as respostas desta versão e gera as não conformidades configuradas.
            Alterações posteriores exigem reabertura justificada por um gestor ou administrador.
          </p>
        )}
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
      <DirtyGuard dirty={state.status !== 'saved'} busy={busy || !!confirm} />
    </>
  );
}
