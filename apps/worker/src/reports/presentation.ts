import type { ActionState, FormQuestion, AnswerValue } from '@portal/contracts';
export const states: Record<ActionState, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  AWAITING_VALIDATION: 'Aguardando validação',
  COMPLETED: 'Concluído',
};
export const priorities: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};
export const dateOnly = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
export const instant = (v: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(v));
export function answer(q: FormQuestion, value: AnswerValue | undefined) {
  if (value === undefined || value === null || value === '') return 'Sem resposta';
  if (q.type === 'YES_NO_NA')
    return (
      ({ YES: 'Sim', NO: 'Não', NA: 'Não se aplica' } as Record<string, string>)[String(value)] ??
      String(value)
    );
  if (q.type === 'SELECT') return q.options?.find((o) => o.id === value)?.label ?? String(value);
  if (q.type === 'DATE') return dateOnly(String(value));
  return typeof value === 'number'
    ? new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 21 }).format(value)
    : String(value);
}
/** Excel stores local wall time without a timezone; explicitly encode São Paulo fields. */
export function excelInstant(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return new Date(
    Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    ),
  );
}
