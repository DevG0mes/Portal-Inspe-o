export type ResourceKind = 'users' | 'units' | 'sectors';
export const resources = {
  users: {
    title: 'Usuários',
    singular: 'usuário',
    create: 'Novo usuário',
    endpoint: 'users',
    description: 'Pessoas, perfis e vínculos de acesso ao portal.',
  },
  units: {
    title: 'Unidades',
    singular: 'unidade',
    create: 'Nova unidade',
    endpoint: 'organization/units',
    description: 'Estrutura das unidades e disponibilidade para novos acessos.',
  },
  sectors: {
    title: 'Setores',
    singular: 'setor',
    create: 'Novo setor',
    endpoint: 'organization/sectors',
    description: 'Setores pertencem a uma unidade e recebem vínculos específicos.',
  },
};
export const roleLabels = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  COLLABORATOR: 'Colaborador',
};
export interface AdminRow {
  id: string;
  name: string;
  isActive: boolean;
  email?: string;
  role?: keyof typeof roleLabels;
  mustChangePassword?: boolean;
  unitId?: string;
  unitName?: string;
}
