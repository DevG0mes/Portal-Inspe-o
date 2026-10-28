import { useState } from 'react';
import type { DefinitionIssue, FormQuestion, FormVersionSnapshot } from '@portal/contracts';
import { Button, Field, Input } from '@portal/ui';
import { ConfirmDialog } from '../shared/confirm-dialog';
import {
  duplicateQuestion,
  duplicateSection,
  moveQuestion,
  moveSection,
  newQuestion,
  newSection,
  removeQuestion,
  removeSection,
  issueLabels,
} from './model';
import { fieldId } from './issue-summary';
import { QuestionEditor } from './question-editor';
export function ContentEditor({
  snapshot,
  issues,
  onChange,
  onError,
}: {
  snapshot: FormVersionSnapshot;
  issues: DefinitionIssue[];
  onChange: (snapshot: FormVersionSnapshot) => void;
  onError: (message: string) => void;
}) {
  const [remove, setRemove] = useState<{ section: number; question?: number }>();
  const count = snapshot.sections.reduce((sum, section) => sum + section.questions.length, 0);
  function apply(operation: () => FormVersionSnapshot) {
    try {
      const next = operation();
      if (
        next.sections.length > 50 ||
        next.sections.reduce((sum, section) => sum + section.questions.length, 0) > 500
      )
        throw new Error('O limite é de 50 seções e 500 perguntas.');
      onChange(next);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Não foi possível alterar o conteúdo.');
    }
  }
  function changeQuestion(section: number, index: number, question: FormQuestion) {
    const next = structuredClone(snapshot);
    next.sections[section]!.questions[index] = question;
    onChange(next);
  }
  function error(path: string) {
    const issue = issues.find((issue) => issue.path === path);
    return issue ? (issueLabels[issue.code] ?? 'Confira este campo.') : undefined;
  }
  return (
    <>
      <Field id={fieldId('title')} label="Título do formulário" error={error('title')}>
        <Input
          id={fieldId('title')}
          maxLength={240}
          value={snapshot.title}
          aria-invalid={!!error('title')}
          aria-describedby={error('title') ? `${fieldId('title')}-error` : undefined}
          onChange={(event) => onChange({ ...snapshot, title: event.target.value })}
        />
      </Field>
      <div id={fieldId('sections')} tabIndex={-1}>
        {!snapshot.sections.length && (
          <div className="empty-state">
            <h2>Monte sua ficha de inspeção</h2>
            <p>Adicione uma seção e organize as perguntas que serão respondidas em campo.</p>
          </div>
        )}
        {snapshot.sections.map((section, sectionIndex) => {
          const path = `sections.${sectionIndex}`;
          return (
            <section
              className="builder-section"
              aria-label={`Seção ${sectionIndex + 1}`}
              key={section.id}
            >
              <div className="builder-item-heading">
                <h2>Seção {sectionIndex + 1}</h2>
                <div className="actions">
                  <Button
                    variant="secondary"
                    disabled={sectionIndex === 0}
                    onClick={() =>
                      apply(() => moveSection(snapshot, sectionIndex, sectionIndex - 1))
                    }
                  >
                    Subir seção {sectionIndex + 1}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={sectionIndex === snapshot.sections.length - 1}
                    onClick={() =>
                      apply(() => moveSection(snapshot, sectionIndex, sectionIndex + 1))
                    }
                  >
                    Descer seção {sectionIndex + 1}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => apply(() => duplicateSection(snapshot, sectionIndex))}
                  >
                    Duplicar seção {sectionIndex + 1}
                  </Button>
                  <Button variant="secondary" onClick={() => setRemove({ section: sectionIndex })}>
                    Remover seção {sectionIndex + 1}
                  </Button>
                </div>
              </div>
              <Field
                id={fieldId(`${path}.title`)}
                label="Título da seção"
                error={error(`${path}.title`)}
              >
                <Input
                  id={fieldId(`${path}.title`)}
                  maxLength={200}
                  value={section.title}
                  aria-invalid={!!error(`${path}.title`)}
                  aria-describedby={
                    error(`${path}.title`) ? `${fieldId(`${path}.title`)}-error` : undefined
                  }
                  onChange={(event) => {
                    const next = structuredClone(snapshot);
                    next.sections[sectionIndex]!.title = event.target.value;
                    onChange(next);
                  }}
                />
              </Field>
              <div id={fieldId(`${path}.questions`)} tabIndex={-1}>
                {section.questions.map((question, index) => (
                  <article
                    className="question-card"
                    key={question.id}
                    aria-label={`Seção ${sectionIndex + 1}, pergunta ${index + 1}`}
                  >
                    <div className="builder-item-heading">
                      <h3>Pergunta {index + 1}</h3>
                      <div className="actions">
                        <Button
                          variant="secondary"
                          disabled={index === 0}
                          onClick={() =>
                            apply(() => moveQuestion(snapshot, sectionIndex, index, index - 1))
                          }
                        >
                          Subir pergunta {index + 1}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={index === section.questions.length - 1}
                          onClick={() =>
                            apply(() => moveQuestion(snapshot, sectionIndex, index, index + 1))
                          }
                        >
                          Descer pergunta {index + 1}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={count >= 500}
                          onClick={() =>
                            apply(() => duplicateQuestion(snapshot, sectionIndex, index))
                          }
                        >
                          Duplicar pergunta {index + 1}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setRemove({ section: sectionIndex, question: index })}
                        >
                          Remover pergunta {index + 1}
                        </Button>
                      </div>
                    </div>
                    <QuestionEditor
                      question={question}
                      snapshot={snapshot}
                      path={`${path}.questions.${index}`}
                      issues={issues}
                      onError={onError}
                      onChange={(value) => changeQuestion(sectionIndex, index, value)}
                    />
                  </article>
                ))}
              </div>
              <Button
                variant="secondary"
                disabled={count >= 500}
                onClick={() => {
                  const next = structuredClone(snapshot);
                  next.sections[sectionIndex]!.questions.push(newQuestion());
                  onChange(next);
                }}
              >
                Adicionar pergunta<span className="sr-only"> à seção {sectionIndex + 1}</span>
              </Button>
            </section>
          );
        })}
      </div>
      <Button
        variant="secondary"
        disabled={snapshot.sections.length >= 50}
        onClick={() => onChange({ ...snapshot, sections: [...snapshot.sections, newSection()] })}
      >
        Adicionar seção
      </Button>
      <ConfirmDialog
        open={!!remove}
        title={remove?.question === undefined ? 'Remover seção?' : 'Remover pergunta?'}
        danger
        confirmLabel="Remover"
        onCancel={() => setRemove(undefined)}
        onConfirm={() => {
          if (remove)
            apply(() =>
              remove.question === undefined
                ? removeSection(snapshot, remove.section)
                : removeQuestion(snapshot, remove.section, remove.question),
            );
          setRemove(undefined);
        }}
      >
        <p>
          O conteúdo será removido deste rascunho. Versões já publicadas permanecem preservadas.
          Dependências precisam ser ajustadas antes da remoção.
        </p>
      </ConfirmDialog>
    </>
  );
}
