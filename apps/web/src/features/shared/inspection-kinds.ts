import type { InspectionKind } from '@portal/contracts';
export const kindLabels: Record<InspectionKind, string> = {
  EPC_GENERAL: 'Inspeção EPC',
  WORK_AT_HEIGHT: 'Trabalho em Altura',
  CONFINED_SPACE: 'Espaço Confinado',
  EXCAVATION: 'Escavação',
  WELDING: 'Atividade com Solda',
};
export interface AvailableTypes {
  configured: boolean;
  types: { kind: InspectionKind; count: number; formId: string | null }[];
}
