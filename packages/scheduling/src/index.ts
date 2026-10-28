import type { CalendarRule, AssignmentState } from '@portal/contracts';
export const TIMEZONE = 'America/Sao_Paulo';
class NonexistentLocalTimeError extends Error {
  constructor() {
    super('Este horário local não existe.');
  }
}
export function materializationKey(id: string, at: string) {
  const instant = Date.parse(at);
  if (!Number.isFinite(instant)) throw new Error('Instante inválido.');
  return `${id}-${instant}`;
}
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
function parts(instant: number) {
  const values = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    epoch: Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    ),
  };
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function occurrence(rule: Pick<CalendarRule, 'time'>, date: string): string {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.time))
    throw new Error('Data ou hora inválida.');
  const naive = Date.parse(`${date}T${rule.time}:00Z`);
  const candidates = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = naive + delta;
    const offset = parts(sample).epoch - sample;
    const instant = naive - offset;
    if (parts(instant).date === date && parts(instant).time === rule.time) candidates.add(instant);
  }
  if (!candidates.size) throw new NonexistentLocalTimeError();
  return new Date(Math.min(...candidates)).toISOString();
}
export function nextOccurrence(rule: CalendarRule, after: string): string | null {
  const anchor = new Date(`${rule.startDate}T12:00:00Z`);
  if (!validDate(rule.startDate)) throw new Error('Data inicial inválida.');
  const afterMs = Date.parse(after);
  if (!Number.isFinite(afterMs)) throw new Error('Instante inválido.');
  const local = parts(afterMs).date;
  const days = Math.floor((Date.parse(`${local}T12:00:00Z`) - anchor.getTime()) / 86400000);
  let index =
    rule.frequency === 'MONTHLY'
      ? Math.max(
          0,
          (Number(local.slice(0, 4)) - anchor.getUTCFullYear()) * 12 +
            Number(local.slice(5, 7)) -
            1 -
            anchor.getUTCMonth(),
        )
      : rule.frequency === 'WEEKLY'
        ? Math.max(0, Math.floor(days / 7))
        : rule.frequency === 'DAILY'
          ? Math.max(0, days)
          : 0;
  for (let attempt = 0; attempt < 4; attempt++, index++) {
    if (rule.frequency === 'ONCE' && index > 0) return null;
    const current = new Date(anchor);
    if (rule.frequency === 'MONTHLY') {
      const month = anchor.getUTCMonth() + index;
      const last = new Date(Date.UTC(anchor.getUTCFullYear(), month + 1, 0)).getUTCDate();
      current.setUTCDate(1);
      current.setUTCMonth(month);
      current.setUTCDate(Math.min(anchor.getUTCDate(), last));
    } else
      current.setUTCDate(
        anchor.getUTCDate() +
          index * (rule.frequency === 'WEEKLY' ? 7 : rule.frequency === 'ONCE' ? 0 : 1),
      );
    const date = current.toISOString().slice(0, 10);
    if (rule.endDate && date > rule.endDate) return null;
    try {
      const result = occurrence(rule, date);
      if (Date.parse(result) > afterMs) return result;
    } catch (error) {
      if (!(error instanceof NonexistentLocalTimeError)) throw error;
    }
  }
  return null;
}
export function assignmentState(at: string, due: string, now: Date): AssignmentState {
  return Date.parse(at) > now.getTime()
    ? 'UPCOMING'
    : Date.parse(due) < now.getTime()
      ? 'OVERDUE'
      : 'PENDING';
}
