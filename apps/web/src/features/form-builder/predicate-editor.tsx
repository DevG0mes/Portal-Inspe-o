import type { FormQuestion, Predicate, RuleScalar } from '@portal/contracts';
import { Button, Field, Input, Select } from '@portal/ui';
export function defaultValue(question: FormQuestion): RuleScalar {
  return question.type === 'YES_NO_NA'
    ? 'NO'
    : question.type === 'SELECT'
      ? (question.options?.[0]?.id ?? '')
      : question.type === 'NUMBER'
        ? 0
        : '';
}
export function PredicateEditor({
  id,
  question,
  predicate,
  onChange,
}: {
  id: string;
  question: FormQuestion;
  predicate: Predicate;
  onChange: (value: Predicate) => void;
}) {
  const values = Array.isArray(predicate.value) ? predicate.value : [predicate.value];
  const choices =
    question.type === 'YES_NO_NA'
      ? [
          { id: 'YES', label: 'Sim' },
          { id: 'NO', label: 'Não' },
          { id: 'NA', label: 'Não se aplica' },
        ]
      : question.type === 'SELECT'
        ? question.options
        : undefined;
  function valueInput(value: RuleScalar, index: number) {
    const inputId = `${id}-value-${index}`;
    function change(raw: string) {
      const next =
        question.type === 'NUMBER' && raw !== '' && Number.isFinite(Number(raw))
          ? Number(raw)
          : raw;
      onChange({
        ...predicate,
        value:
          predicate.operator === 'IN'
            ? values.map((current, position) => (position === index ? next : current))
            : next,
      });
    }
    return (
      <div className="rule-value" key={inputId}>
        <Field id={inputId} label={`Valor ${index + 1}`}>
          <Input
            id={inputId}
            type={
              question.type === 'DATE' ? 'date' : question.type === 'NUMBER' ? 'number' : 'text'
            }
            step={question.type === 'NUMBER' ? 'any' : undefined}
            maxLength={10000}
            value={value}
            onChange={(event) => change(event.target.value)}
          />
        </Field>
        {predicate.operator === 'IN' && (
          <Button
            variant="secondary"
            disabled={values.length <= 1}
            onClick={() =>
              onChange({ ...predicate, value: values.filter((_, position) => position !== index) })
            }
          >
            Remover valor {index + 1}
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="predicate-editor">
      <Field id={`${id}-operator`} label="Comparação">
        <Select
          id={`${id}-operator`}
          value={predicate.operator}
          onChange={(event) => {
            const operator = event.target.value as Predicate['operator'];
            onChange({
              operator,
              value: operator === 'IN' ? values : (values[0] ?? defaultValue(question)),
            });
          }}
        >
          <option value="EQ">Igual a</option>
          <option value="NEQ">Diferente de</option>
          <option value="IN">Um destes valores</option>
        </Select>
      </Field>
      {choices ? (
        predicate.operator === 'IN' ? (
          <fieldset className="choice-list">
            <legend>Valores que atendem à regra</legend>
            {choices.map((option) => (
              <label key={option.id}>
                <input
                  type="checkbox"
                  checked={values.includes(option.id)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...values.filter((value) => value !== ''), option.id]
                      : values.filter((value) => value !== option.id && value !== '');
                    onChange({ ...predicate, value: next.length ? next : [''] });
                  }}
                />
                {option.label || 'Opção sem rótulo'}
              </label>
            ))}
          </fieldset>
        ) : (
          <Field id={`${id}-value`} label="Valor da regra">
            <Select
              id={`${id}-value`}
              value={String(predicate.value)}
              onChange={(event) => onChange({ ...predicate, value: event.target.value })}
            >
              <option value="">Selecione…</option>
              {choices.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label || 'Opção sem rótulo'}
                </option>
              ))}
            </Select>
          </Field>
        )
      ) : (
        <>
          {values.map(valueInput)}
          {predicate.operator === 'IN' && (
            <Button
              variant="secondary"
              disabled={values.length >= 100}
              onClick={() => onChange({ ...predicate, value: [...values, defaultValue(question)] })}
            >
              Adicionar valor
            </Button>
          )}
        </>
      )}
    </div>
  );
}
