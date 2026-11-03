export type ResourceKind = 'users' | 'units' | 'sectors' | 'customers' | 'locations' | 'addresses';
export const resources = {
  customers: {
    title: 'Clientes',
    singular: 'cliente',
    create: 'Novo cliente',
    endpoint: 'organization/customers',
    description: 'Clientes podem atender várias unidades de negócio.',
  },
  addresses: {
    title: 'Endereços',
    singular: 'endereço',
    create: 'Novo endereço',
    endpoint: 'organization/locations',
    description: 'Endereços de alojamentos por cidade.',
  },
  locations: {
    title: 'Subestações',
    singular: 'subestação',
    create: 'Nova subestação',
    endpoint: 'organization/locations',
    description: 'Subestações pertencem a um cliente. Desativar preserva as inspeções anteriores.',
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
    title: 'Tipos de inspeção',
    singular: 'tipo de inspeção',
    create: 'Novo tipo de inspeção',
    endpoint: 'organization/sectors',
    description: 'Tipos de inspeção pertencem a uma unidade e recebem vínculos específicos.',
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
  city?: string | null;
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
