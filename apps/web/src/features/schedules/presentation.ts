export const frequencyLabels = {
  ONCE: 'Única',
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
};
export const assignmentLabels = {
  UPCOMING: 'Próxima',
  PENDING: 'Pendente',
  OVERDUE: 'Vencida',
  CANCELLED: 'Cancelada',
};
export function localInstant(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(new Date(value))
    : 'Nenhuma geração pendente';
}
