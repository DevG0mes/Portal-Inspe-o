import type { AnswerInput, FormQuestion } from '@portal/contracts';
export function displayAnswer(question: FormQuestion, answers: AnswerInput[]) {
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
