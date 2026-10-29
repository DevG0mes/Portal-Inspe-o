import type { ActionState } from '@portal/contracts';
export const actionStates: Record<ActionState, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  AWAITING_VALIDATION: 'Aguardando validação',
  COMPLETED: 'Concluído',
};
export const eventLabels: Record<string, string> = {
  CREATED: 'Plano criado',
  ASSIGN: 'Atribuição atualizada',
  START: 'Execução iniciada',
  COMMENT: 'Comentário',
  REQUEST_VALIDATION: 'Validação solicitada',
  APPROVE: 'Correção aprovada',
  RETURN: 'Plano devolvido',
};
