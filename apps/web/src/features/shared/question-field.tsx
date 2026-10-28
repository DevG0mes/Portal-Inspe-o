'use client';
import type { AnswerValue, FormQuestion } from '@portal/contracts';
import { Field, Input, Select } from '@portal/ui';

/** Canonical typed answer control shared by preview and actual inspection execution. */
export function QuestionField({
  question,
  id,
  value,
  error,
  onChange,
}: {
  question: FormQuestion;
  id: string;
  value: AnswerValue;
  error?: string;
  onChange: (value: AnswerValue) => void;
}) {
  const accessibility = {
    'aria-invalid': !!error,
    'aria-describedby': error ? `${id}-error` : undefined,
  };
  return (
    <Field
      id={id}
      label={`${question.label}${question.required ? ' (obrigatória)' : ''}`}
      error={error}
    >
      {question.type === 'SELECT' || question.type === 'YES_NO_NA' ? (
        <Select
          id={id}
          value={String(value ?? '')}
          {...accessibility}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">Selecione…</option>
          {(question.type === 'SELECT'
            ? (question.options ?? [])
            : [
                { id: 'YES', label: 'Sim' },
                { id: 'NO', label: 'Não' },
                { id: 'NA', label: 'Não se aplica' },
              ]
          ).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          id={id}
          type={question.type === 'NUMBER' ? 'number' : question.type === 'DATE' ? 'date' : 'text'}
          step={question.type === 'NUMBER' ? 'any' : undefined}
          maxLength={10000}
          value={value ?? ''}
          {...accessibility}
          onChange={(event) =>
            onChange(
              event.target.value === ''
                ? null
                : question.type === 'NUMBER'
                  ? Number(event.target.value)
                  : event.target.value,
            )
          }
        />
      )}
    </Field>
  );
}
