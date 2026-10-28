'use client';
import { useId, useMemo, useState } from 'react';
import type { AnswerInput, EvaluationResult, FormVersionSnapshot } from '@portal/contracts';
import { RuleEngine } from '@portal/form-engine';
import { Button, Notice } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ErrorNotice } from '../shared/error-notice';
import { QuestionField } from '../shared/question-field';
import { IssueSummary } from '../form-builder/issue-summary';
import { priorityLabels } from '../form-builder/model';
export function FormPreview({
  snapshot,
  templateId,
  revision,
}: {
  snapshot: FormVersionSnapshot;
  templateId?: string;
  revision?: number;
}) {
  const [answers, setAnswers] = useState<AnswerInput[]>([]);
  const prefix = useId();
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<EvaluationResult>();
  const [error, setError] = useState<unknown>();
  const result = useMemo(() => new RuleEngine().evaluate(snapshot, answers), [snapshot, answers]);
  function answer(questionId: string, value: string | number | null) {
    setVerified(undefined);
    setError(undefined);
    setAnswers((current) => [
      ...current.filter((answer) => answer.questionId !== questionId),
      { questionId, value },
    ]);
  }
  async function verify() {
    if (busy || !templateId) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api<{ revision: number; result: EvaluationResult }>(
        `forms/${templateId}/preview`,
        { method: 'POST', body: JSON.stringify({ revision, answers }) },
      );
      setVerified(response.result);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card form-preview" aria-label="Pré-visualização">
      <span className="eyebrow">SIMULAÇÃO · SEM REGISTRO DE INSPEÇÃO</span>
      <h2>{snapshot.title || 'Formulário sem título'}</h2>
      <p className="muted">
        Teste as respostas e as condições. As respostas desta simulação ficam apenas nesta página.
      </p>
      <IssueSummary issues={result.definitionErrors} />
      {!result.definitionErrors.length && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
        >
          <fieldset disabled={busy}>
            {snapshot.sections.map((section) => {
              const questions = section.questions.filter((question) =>
                result.visibleQuestionIds.includes(question.id),
              );
              return (
                questions.length > 0 && (
                  <section key={section.id} className="preview-section">
                    <h3>{section.title}</h3>
                    {questions.map((question) => {
                      const value =
                        answers.find((answer) => answer.questionId === question.id)?.value ?? '';
                      const issue = result.errors.find((error) => error.questionId === question.id);
                      const error = issue
                        ? issue.code === 'REQUIRED'
                          ? 'Resposta obrigatória.'
                          : 'Confira o valor informado.'
                        : undefined;
                      const id = `preview-${prefix}-${question.id}`;
                      return (
                        <QuestionField
                          key={question.id}
                          id={id}
                          question={question}
                          value={value}
                          error={error}
                          onChange={(value) => answer(question.id, value)}
                        />
                      );
                    })}
                  </section>
                )
              );
            })}
            {templateId && (
              <Button type="submit" disabled={busy}>
                {busy ? 'Conferindo…' : 'Conferir na API'}
              </Button>
            )}
          </fieldset>
        </form>
      )}
      <div className="preview-findings">
        <h3>Ocorrências simuladas</h3>
        {result.nonconformities.length ? (
          <ul>
            {result.nonconformities.map((item) => (
              <li key={item.key}>
                {item.category} · Prioridade {priorityLabels[item.priority].toLowerCase()}
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhuma ocorrência nas respostas atuais.</p>
        )}
      </div>
      {error !== undefined && <ErrorNotice error={error} />}
      {verified && (
        <Notice>
          Prévia conferida na API. {verified.nonconformities.length} ocorrência(s);{' '}
          {verified.errors.length} resposta(s) a revisar.
        </Notice>
      )}
    </section>
  );
}
