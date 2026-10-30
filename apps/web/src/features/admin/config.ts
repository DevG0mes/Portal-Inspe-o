export type ResourceKind = 'users' | 'units' | 'sectors' | 'customers' | 'locations';
export const resources = {
  customers: {
    title: 'Clientes',
    singular: 'cliente',
    create: 'Novo cliente',
    endpoint: 'organization/customers',
    description: 'Clientes podem atender várias unidades de negócio.',
  },
  locations: {
    title: 'Locais',
    singular: 'local',
    create: 'Novo local',
    endpoint: 'organization/locations',
    description: 'Locais pertencem a um cliente. Desativar preserva as inspeções anteriores.',
  },
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
  revision?: number;
  customerId?: string;
  customerName?: string;
  unitIds?: string[];
  units?: { id: string; name: string; isActive: boolean }[];
  id: string;
  name: string;
  isActive: boolean;
  email?: string;
  role?: keyof typeof roleLabels;
  mustChangePassword?: boolean;
  unitId?: string;
  unitName?: string;
}
