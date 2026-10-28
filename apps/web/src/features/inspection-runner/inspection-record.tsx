'use client';
import { useState } from 'react';
import type { AnswerInput, FormQuestion, InspectionView } from '@portal/contracts';
import { RuleEngine } from '@portal/form-engine';
import { Button, Field, Input, Notice, Select } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { ErrorNotice } from '../shared/error-notice';
import { localInstant } from '../schedules/presentation';
import { priorityLabels } from '../form-builder/model';
function displayAnswer(question: FormQuestion, answers: AnswerInput[]) {
  const value = answers.find((answer) => answer.questionId === question.id)?.value;
  if (value === null || value === undefined || value === '') return 'Sem resposta';
  if (question.type === 'YES_NO_NA')
    return (
      ({ YES: 'Sim', NO: 'Não', NA: 'Não se aplica' } as Record<string, string>)[String(value)] ??
      String(value)
    );
  if (question.type === 'SELECT')
    return question.options?.find((option) => option.id === value)?.label ?? String(value);
  if (question.type === 'DATE' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value.split('-').reverse().join('/');
  return typeof value === 'number'
    ? new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 21 }).format(value)
    : String(value);
}
export function InspectionRecord({
  row,
  onReopened,
  onReload,
  historyOnly = false,
}: {
  row: InspectionView;
  onReopened?: (row: InspectionView) => void;
  onReload?: () => void;
  historyOnly?: boolean;
}) {
  const [cycle, setCycle] = useState(
    row.state === 'DRAFT' && !historyOnly
      ? row.cycle
      : (row.submissions.at(-1)?.cycle ?? row.cycle),
  );
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(''),
    [reasonError, setReasonError] = useState(''),
    [error, setError] = useState<unknown>();
  const submission = row.submissions.find((item) => item.cycle === cycle);
  const answers =
    row.state === 'DRAFT' && !historyOnly && cycle === row.cycle
      ? row.answers
      : (submission?.answers ?? []);
  const result = new RuleEngine().evaluate(row.snapshot, answers);
  async function reopen() {
    if (busy) return;
    if (reason.trim().length < 5) {
      setReasonError('Informe uma justificativa com pelo menos 5 caracteres.');
      document.getElementById('inspection-reason')?.focus();
      return;
    }
    setBusy(true);
    setError(undefined);
    setReasonError('');
    try {
      onReopened?.(
        await api<InspectionView>(`inspections/${row.id}/reopen`, {
          method: 'POST',
          body: JSON.stringify({ revision: row.revision, reason: reason.trim() }),
        }),
      );
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card">
        {!historyOnly && (
          <Notice>
            {row.state === 'COMPLETED'
              ? 'Inspeção concluída. Respostas e ocorrências preservadas no histórico.'
              : 'Consulta do rascunho. O preenchimento está disponível apenas ao criador ou aos responsáveis.'}
          </Notice>
        )}
        {historyOnly && <h2>Histórico de conclusões</h2>}
        {!historyOnly && (
          <div className="actions">
            <Button variant="secondary" onClick={onReload}>
              Atualizar inspeção
            </Button>
            {row.state === 'COMPLETED' && row.canReopen && (
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(true);
                  setError(undefined);
                }}
              >
                Reabrir inspeção
              </Button>
            )}
          </div>
        )}
        {row.submissions.length > 0 && (
          <Field id="inspection-cycle" label="Ciclo consultado">
            <Select
              id="inspection-cycle"
              value={cycle}
              onChange={(event) => setCycle(Number(event.target.value))}
            >
              {row.submissions.map((item) => (
                <option key={item.id} value={item.cycle}>
                  Ciclo {item.cycle} · {localInstant(item.completedAt)}
                </option>
              ))}
              {row.state === 'DRAFT' && !historyOnly && (
                <option value={row.cycle}>Ciclo {row.cycle} · Em preenchimento</option>
              )}
            </Select>
          </Field>
        )}
        {submission && (
          <p>
            Conclusão registrada em{' '}
            <time dateTime={submission.completedAt}>{localInstant(submission.completedAt)}</time>.
            Revisão de origem {submission.sourceRevision}.
          </p>
        )}
      </section>
      {row.snapshot.sections.map((section) => {
        const questions = section.questions.filter((question) =>
          result.visibleQuestionIds.includes(question.id),
        );
        return (
          questions.length > 0 && (
            <section className="card" key={section.id}>
              <h2>{section.title}</h2>
              <dl className="inspection-record">
                {questions.map((question) => (
                  <div key={question.id}>
                    <dt>{question.label}</dt>
                    <dd>{displayAnswer(question, answers)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        );
      })}
      {submission && (
        <section className="card">
          <h2>Não conformidades deste ciclo</h2>
          {submission.nonconformities.length ? (
            <ul>
              {submission.nonconformities.map((item) => (
                <li key={item.key}>
                  {item.category} · Prioridade {priorityLabels[item.priority].toLowerCase()}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma não conformidade registrada neste ciclo.</p>
          )}
        </section>
      )}
      {!historyOnly && (
        <ConfirmDialog
          open={open}
          busy={busy}
          title="Reabrir esta inspeção?"
          confirmLabel="Reabrir inspeção"
          onCancel={() => setOpen(false)}
          onConfirm={reopen}
        >
          <p>O histórico será mantido e um novo ciclo de preenchimento será aberto.</p>
          <Field id="inspection-reason" label="Justificativa da reabertura" error={reasonError}>
            <Input
              id="inspection-reason"
              value={reason}
              disabled={busy}
              maxLength={2000}
              aria-invalid={!!reasonError}
              aria-describedby={reasonError ? 'inspection-reason-error' : undefined}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {error !== undefined && <ErrorNotice error={error} />}
        </ConfirmDialog>
      )}
    </>
  );
}
