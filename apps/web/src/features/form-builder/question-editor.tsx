import { useState } from 'react';
import type { DefinitionIssue, FormQuestion, FormVersionSnapshot } from '@portal/contracts';
import { Button, Field, Input, Select } from '@portal/ui';
import { dependents, issueLabels, previousQuestions, priorityLabels, questionTypes } from './model';
import { fieldId } from './issue-summary';
import { defaultValue, PredicateEditor } from './predicate-editor';
import { ConfirmDialog } from '../shared/confirm-dialog';
export function QuestionEditor({
  question,
  path,
  snapshot,
  issues,
  onChange,
  onError,
}: {
  question: FormQuestion;
  path: string;
  snapshot: FormVersionSnapshot;
  issues: DefinitionIssue[];
  onChange: (question: FormQuestion) => void;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState<{ title: string; apply: () => void }>();
  const previous = previousQuestions(snapshot, question.id);
  const error = (suffix: string) => {
    const issue = issues.find(
      (issue) => issue.path === `${path}.${suffix}` || issue.path.startsWith(`${path}.${suffix}.`),
    );
    return issue ? (issueLabels[issue.code] ?? 'Confira este campo.') : undefined;
  };
  function changeType(type: FormQuestion['type']) {
    if (dependents(snapshot, [question.id]).length) {
      onError(
        'Outras perguntas dependem desta pergunta. Remova as condições antes de mudar o tipo.',
      );
      return;
    }
    const apply = () =>
      onChange({
        id: question.id,
        label: question.label,
        required: question.required,
        type,
        ...(type === 'SELECT' ? { options: [] } : {}),
        visibleWhen: question.visibleWhen,
      });
    if (question.options?.length || question.nonconformity)
      setPending({ title: 'Alterar tipo e descartar configurações?', apply });
    else apply();
  }
  function removeOption(id: string) {
    const references = snapshot.sections
      .flatMap((section) => section.questions)
      .some(
        (item) =>
          (item.id === question.id &&
            item.nonconformity &&
            [item.nonconformity.value].flat().includes(id)) ||
          item.visibleWhen?.some(
            (rule) => rule.questionId === question.id && [rule.value].flat().includes(id),
          ),
      );
    if (references) {
      onError('Esta opção é usada em uma regra. Ajuste a regra antes de remover a opção.');
      return;
    }
    setPending({
      title: 'Remover opção?',
      apply: () =>
        onChange({ ...question, options: question.options?.filter((option) => option.id !== id) }),
    });
  }
  return (
    <>
      <Field id={fieldId(`${path}.label`)} label="Texto da pergunta" error={error('label')}>
        <Input
          id={fieldId(`${path}.label`)}
          value={question.label}
          maxLength={240}
          aria-invalid={!!error('label')}
          aria-describedby={error('label') ? `${fieldId(`${path}.label`)}-error` : undefined}
          onChange={(event) => onChange({ ...question, label: event.target.value })}
        />
      </Field>
      <div className="question-settings">
        <Field id={fieldId(`${path}.type`)} label="Tipo de resposta">
          <Select
            id={fieldId(`${path}.type`)}
            value={question.type}
            onChange={(event) => changeType(event.target.value as FormQuestion['type'])}
          >
            {Object.entries(questionTypes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <label className="check-label">
          <input
            type="checkbox"
            checked={question.required}
            onChange={(event) => onChange({ ...question, required: event.target.checked })}
          />
          Resposta obrigatória
        </label>
      </div>
      {question.type === 'SELECT' && (
        <fieldset className="builder-options" id={fieldId(`${path}.options`)} tabIndex={-1}>
          <legend>Opções de resposta</legend>
          {question.options?.map((option, index) => (
            <div className="option-row" key={option.id}>
              <Field
                id={fieldId(`${path}.options.${index}.label`)}
                label={`Opção ${index + 1}`}
                error={error(`options.${index}.label`)}
              >
                <Input
                  id={fieldId(`${path}.options.${index}.label`)}
                  maxLength={160}
                  aria-invalid={!!error(`options.${index}.label`)}
                  aria-describedby={
                    error(`options.${index}.label`)
                      ? `${fieldId(`${path}.options.${index}.label`)}-error`
                      : undefined
                  }
                  value={option.label}
                  onChange={(event) =>
                    onChange({
                      ...question,
                      options: question.options?.map((item) =>
                        item.id === option.id ? { ...item, label: event.target.value } : item,
                      ),
                    })
                  }
                />
              </Field>
              <Button variant="secondary" onClick={() => removeOption(option.id)}>
                Remover opção {index + 1}
              </Button>
            </div>
          ))}
          {error('options') && <p className="field-error">{error('options')}</p>}
          <Button
            variant="secondary"
            disabled={(question.options?.length ?? 0) >= 100}
            onClick={() =>
              onChange({
                ...question,
                options: [...(question.options ?? []), { id: crypto.randomUUID(), label: '' }],
              })
            }
          >
            Adicionar opção
          </Button>
        </fieldset>
      )}
      <fieldset className="builder-rules" id={fieldId(`${path}.visibleWhen`)} tabIndex={-1}>
        <legend>Condições de exibição</legend>
        <p className="small muted">
          Todas as condições devem ser atendidas. Use somente perguntas anteriores.
        </p>
        {question.visibleWhen?.map((condition, index) => {
          const target = previous.find((item) => item.id === condition.questionId);
          return (
            <div className="rule-card" key={`${question.id}-${index}`}>
              <Field
                id={`${question.id}-reference-${index}`}
                label={`Pergunta de referência ${index + 1}`}
              >
                <Select
                  id={`${question.id}-reference-${index}`}
                  value={condition.questionId}
                  onChange={(event) => {
                    const target = previous.find((item) => item.id === event.target.value)!;
                    onChange({
                      ...question,
                      visibleWhen: question.visibleWhen?.map((rule, position) =>
                        position === index
                          ? { questionId: target.id, operator: 'EQ', value: defaultValue(target) }
                          : rule,
                      ),
                    });
                  }}
                >
                  {!target && <option value={condition.questionId}>Referência indisponível</option>}
                  {previous.map((item, position) => (
                    <option key={item.id} value={item.id}>
                      {position + 1}. {item.label || 'Pergunta sem título'}
                    </option>
                  ))}
                </Select>
              </Field>
              {target && (
                <PredicateEditor
                  id={`${question.id}-condition-${index}`}
                  question={target}
                  predicate={condition}
                  onChange={(value) =>
                    onChange({
                      ...question,
                      visibleWhen: question.visibleWhen?.map((rule, position) =>
                        position === index ? { ...value, questionId: condition.questionId } : rule,
                      ),
                    })
                  }
                />
              )}
              <Button
                variant="secondary"
                onClick={() =>
                  setPending({
                    title: 'Remover condição?',
                    apply: () =>
                      onChange({
                        ...question,
                        visibleWhen: question.visibleWhen?.filter(
                          (_, position) => position !== index,
                        ),
                      }),
                  })
                }
              >
                Remover condição {index + 1}
              </Button>
            </div>
          );
        })}
        {error('visibleWhen') && <p className="field-error">{error('visibleWhen')}</p>}
        <Button
          variant="secondary"
          disabled={!previous.length || (question.visibleWhen?.length ?? 0) >= 20}
          onClick={() => {
            const target = previous.at(-1)!;
            onChange({
              ...question,
              visibleWhen: [
                ...(question.visibleWhen ?? []),
                { questionId: target.id, operator: 'EQ', value: defaultValue(target) },
              ],
            });
          }}
        >
          Adicionar condição
        </Button>
      </fieldset>
      <fieldset className="builder-rules" id={fieldId(`${path}.nonconformity`)} tabIndex={-1}>
        <legend>Não conformidade</legend>
        <label className="check-label">
          <input
            type="checkbox"
            checked={!!question.nonconformity}
            onChange={(event) => {
              if (!event.target.checked)
                setPending({
                  title: 'Remover regra de ocorrência?',
                  apply: () => onChange({ ...question, nonconformity: undefined }),
                });
              else
                onChange({
                  ...question,
                  nonconformity: {
                    operator: 'EQ',
                    value: defaultValue(question),
                    category: '',
                    priority: 'MEDIUM',
                  },
                });
            }}
          />
          Gerar ocorrência quando a resposta atender à regra
        </label>
        {question.nonconformity && (
          <>
            <PredicateEditor
              id={`${question.id}-nonconformity`}
              question={question}
              predicate={question.nonconformity}
              onChange={(value) =>
                onChange({ ...question, nonconformity: { ...question.nonconformity!, ...value } })
              }
            />
            <Field
              id={fieldId(`${path}.nonconformity.category`)}
              label="Categoria da ocorrência"
              error={error('nonconformity.category')}
            >
              <Input
                id={fieldId(`${path}.nonconformity.category`)}
                value={question.nonconformity.category}
                maxLength={120}
                aria-invalid={!!error('nonconformity.category')}
                aria-describedby={
                  error('nonconformity.category')
                    ? `${fieldId(`${path}.nonconformity.category`)}-error`
                    : undefined
                }
                onChange={(event) =>
                  onChange({
                    ...question,
                    nonconformity: { ...question.nonconformity!, category: event.target.value },
                  })
                }
              />
            </Field>
            <Field id={`${question.id}-priority`} label="Prioridade">
              <Select
                id={`${question.id}-priority`}
                value={question.nonconformity.priority}
                onChange={(event) =>
                  onChange({
                    ...question,
                    nonconformity: {
                      ...question.nonconformity!,
                      priority: event.target.value as NonNullable<
                        FormQuestion['nonconformity']
                      >['priority'],
                    },
                  })
                }
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            {error('nonconformity') && <p className="field-error">{error('nonconformity')}</p>}
          </>
        )}
      </fieldset>
      <ConfirmDialog
        open={!!pending}
        title={pending?.title ?? 'Confirmar alteração'}
        danger
        onCancel={() => setPending(undefined)}
        onConfirm={() => {
          pending?.apply();
          setPending(undefined);
        }}
      >
        <p>
          Esta alteração remove configurações do rascunho e será salva automaticamente. Versões
          publicadas permanecem preservadas.
        </p>
      </ConfirmDialog>
    </>
  );
}
