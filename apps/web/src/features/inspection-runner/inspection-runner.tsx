'use client';
import { IdentificationSummary } from '../shared/identification-summary';
import { usePilot } from '../auth/pilot';
import { usePresentation } from '../auth/presentation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  EvidenceFile,
  EvidenceReceipt,
  InspectionDraftContent,
  InspectionView,
  UploadPolicy,
} from '@portal/contracts';
import { RuleEngine } from '@portal/form-engine';
import { Button, Field, Textarea, Notice, Skeleton } from '@portal/ui';
import { api, ApiError } from '../../lib/api-client';
import { useResource } from '../shared/use-resource';
import { useHydrated } from '../shared/use-hydrated';
import { DraftSession } from '../shared/draft-session';
import { DirtyGuard } from '../shared/dirty-guard';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { ErrorNotice } from '../shared/error-notice';
import { QuestionField } from '../shared/question-field';
import { InspectionRecord } from './inspection-record';
import { EvidenceControls } from './evidence-controls';

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
        <a className="back-link" href="/inspections">
          <span className="back-link-arrow" aria-hidden="true">
            ←
          </span>
          Inspeções
        </a>
        <span className="eyebrow">
          {row.assignmentId ? 'INSPEÇÃO ATRIBUÍDA' : 'INSPEÇÃO AVULSA'}
        </span>
        <h1>{row.snapshot.title}</h1>
        <p>
          Formulário · versão {row.formVersionNumber} · Ciclo {row.cycle}
        </p>
        <p className="inspection-protocol muted">Protocolo: {row.id}</p>
      </div>
      <IdentificationSummary context={row.context} />
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
  const mobile = usePresentation() === 'mobile';
  const [sectionId, setSectionId] = useState<string>();
  const hydrated = useHydrated();
  const [session] = useState(
    () =>
      new DraftSession<InspectionDraftContent>(
        {
          revision: initial.revision,
          snapshot: { answers: initial.answers, notes: initial.notes ?? [] },
        },
        async (revision, content) => {
          const receipt = await api<InspectionView>(`inspections/${initial.id}/draft`, {
            method: 'PUT',
            body: JSON.stringify({ revision, ...content }),
          });
          return {
            revision: receipt.revision,
            snapshot: { answers: receipt.answers, notes: receipt.notes },
          };
        },
      ),
  );
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    session.connect();
    return () => session.dispose();
  }, [session]);
  const [confirm, setConfirm] = useState<'complete' | 'reload' | 'detach'>(),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [error, setError] = useState<unknown>();
  const [files, setFiles] = useState(initial.evidence ?? []);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(() => new Set());
  const [removing, setRemoving] = useState<EvidenceFile>();
  const [policyRevision, setPolicyRevision] = useState(0);
  const pilot = usePilot();
  const policy = useResource<UploadPolicy>(pilot ? null : 'files/policy', policyRevision);
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
  const result = new RuleEngine().evaluate(initial.snapshot, state.snapshot.answers);
  const sections = initial.snapshot.sections.filter((section) =>
    section.questions.some((question) => result.visibleQuestionIds.includes(question.id)),
  );
  const step = Math.max(
    0,
    sections.findIndex((section) => section.id === sectionId),
  );
  function goToSection(id: string) {
    setSectionId(id);
    setFocusTarget(`section-${id}`);
  }
  function showQuestion(id: string) {
    if (mobile)
      setSectionId(
        initial.snapshot.sections.find((section) =>
          section.questions.some((question) => question.id === id),
        )?.id,
      );
    setFocusTarget(`answer-${id}`);
  }
  const answered = result.acceptedAnswers.filter(
    (answer) => answer.value !== null && answer.value !== '',
  ).length;
  const conflict = state.status === 'conflict';
  async function beginEvidence() {
    if (busy || confirm || conflict) return undefined;
    setBusy(true);
    setError(undefined);
    if (!(await session.flush())) {
      setBusy(false);
      return undefined;
    }
    return session.getSnapshot().revision;
  }
  function receipt(expected: number, result: EvidenceReceipt) {
    if (session.acceptRevision(expected, result.revision)) setFiles(result.files);
  }
  function fileFailure(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 409) session.markConflict(failure);
  }
  async function detach() {
    if (busy || !removing || conflict) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!(await session.flush())) return;
      const revision = session.getSnapshot().revision;
      const result = await api<EvidenceReceipt>(`files/${removing.id}/detach`, {
        method: 'POST',
        body: JSON.stringify({ revision }),
      });
      receipt(revision, result);
      setConfirm(undefined);
      setRemoving(undefined);
    } catch (failure) {
      setError(failure);
      fileFailure(failure);
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    if (busy || conflict) return;
    const pendingQuestion = result.visibleQuestionIds.find(
      (id) =>
        selectedQuestions.has(id) ||
        files.some(
          (file) =>
            file.questionId === id &&
            file.status !== 'READY' &&
            Date.parse(file.expiresAt!) > Date.now(),
        ),
    );
    if (pendingQuestion) {
      showQuestion(pendingQuestion);
      setError(
        new Error('Envie, limpe a seleção ou cancele os arquivos pendentes antes de concluir.'),
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    setAttempted(true);
    try {
      if (!(await session.flush())) return;
      const checked = new RuleEngine().evaluate(
        initial.snapshot,
        session.getSnapshot().snapshot.answers,
      );
      if (checked.errors.length || checked.definitionErrors.length) {
        const first = checked.errors[0];
        if (first) showQuestion(first.questionId);
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
                answers: state.snapshot.answers,
                notes: state.snapshot.notes,
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
      {error !== undefined && !confirm && <ErrorNotice error={error} />}
      {policy.error && (
        <section className="card">
          <ErrorNotice error={policy.error} />
          <Button variant="secondary" onClick={() => setPolicyRevision(policyRevision + 1)}>
            Recarregar limites de envio
          </Button>
        </section>
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
          {mobile && sections.length > 0 && (
            <p className="inspection-step" aria-live="polite">
              Etapa {step + 1} de {sections.length}
            </p>
          )}
          {initial.snapshot.sections.map((section, index) => {
            const questions = section.questions.filter((question) =>
              result.visibleQuestionIds.includes(question.id),
            );
            return (
              questions.length > 0 && (
                <section
                  className="card preview-section"
                  key={section.id}
                  hidden={mobile && sections[step]?.id !== section.id}
                >
                  <h2 id={`section-${section.id}`} tabIndex={mobile ? -1 : undefined}>
                    {index + 1}. {section.title}
                  </h2>
                  {questions.map((question) => {
                    const issue =
                      attempted && result.errors.find((issue) => issue.questionId === question.id);
                    return (
                      <div key={question.id} className="inspection-question">
                        <QuestionField
                          id={`answer-${question.id}`}
                          question={question}
                          value={
                            state.snapshot.answers.find(
                              (answer) => answer.questionId === question.id,
                            )?.value ?? null
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
                            session.edit({
                              ...session.getSnapshot().snapshot,
                              answers: [
                                ...session
                                  .getSnapshot()
                                  .snapshot.answers.filter(
                                    (answer) => answer.questionId !== question.id,
                                  ),
                                { questionId: question.id, value },
                              ],
                            });
                          }}
                        />
                        <Field id={`note-${question.id}`} label={`Observação · ${question.label}`}>
                          <Textarea
                            id={`note-${question.id}`}
                            className="resize-none"
                            rows={3}
                            maxLength={2000}
                            value={
                              state.snapshot.notes.find((note) => note.questionId === question.id)
                                ?.text ?? ''
                            }
                            onChange={(event) =>
                              session.edit({
                                ...session.getSnapshot().snapshot,
                                notes: [
                                  ...session
                                    .getSnapshot()
                                    .snapshot.notes.filter(
                                      (note) => note.questionId !== question.id,
                                    ),
                                  { questionId: question.id, text: event.target.value },
                                ],
                              })
                            }
                          />
                        </Field>
                        {!pilot && (
                          <EvidenceControls
                            inspectionId={initial.id}
                            questionId={question.id}
                            questionLabel={question.label}
                            files={files.filter((file) => file.questionId === question.id)}
                            policy={policy.data}
                            onBegin={beginEvidence}
                            onEnd={() => setBusy(false)}
                            onPending={(file) =>
                              setFiles((current) => [
                                ...current.filter((item) => item.id !== file.id),
                                file,
                              ])
                            }
                            onReceipt={receipt}
                            onRemove={(file) => {
                              setRemoving(file);
                              setConfirm('detach');
                              setError(undefined);
                            }}
                            onFailure={fileFailure}
                            onSelection={(selected) =>
                              setSelectedQuestions((current) => {
                                if (current.has(question.id) === selected) return current;
                                const next = new Set(current);
                                if (selected) next.add(question.id);
                                else next.delete(question.id);
                                return next;
                              })
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </section>
              )
            );
          })}
          <div className="card actions">
            {mobile && step > 0 && (
              <Button variant="secondary" onClick={() => goToSection(sections[step - 1]!.id)}>
                Etapa anterior
              </Button>
            )}
            {mobile && step < sections.length - 1 ? (
              <Button key="next-section" onClick={() => goToSection(sections[step + 1]!.id)}>
                Próxima etapa
              </Button>
            ) : (
              <Button key="review-inspection" type="submit" disabled={state.status === 'error'}>
                Revisar e concluir
              </Button>
            )}
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
        title={
          confirm === 'reload'
            ? 'Descartar respostas locais?'
            : confirm === 'detach'
              ? 'Remover evidência desta inspeção?'
              : 'Concluir esta inspeção?'
        }
        confirmLabel={
          confirm === 'reload'
            ? 'Descartar e recarregar'
            : confirm === 'detach'
              ? 'Remover evidência'
              : 'Concluir inspeção'
        }
        danger={confirm !== 'complete'}
        onCancel={() => setConfirm(undefined)}
        onConfirm={confirm === 'reload' ? onReload : confirm === 'detach' ? detach : complete}
      >
        {confirm === 'reload' ? (
          <p>
            As respostas desta aba serão descartadas e substituídas pelas que estão salvas no
            servidor.
          </p>
        ) : confirm === 'detach' ? (
          <p>
            O arquivo será desvinculado do preenchimento. Evidências de ciclos concluídos continuam
            preservadas.
          </p>
        ) : (
          <p>
            A conclusão preserva as respostas desta versão e gera as não conformidades configuradas.
            Alterações posteriores exigem reabertura justificada por um gestor ou administrador.
          </p>
        )}
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
      <DirtyGuard
        dirty={state.status !== 'saved' || selectedQuestions.size > 0}
        busy={busy || !!confirm}
      />
    </>
  );
}
