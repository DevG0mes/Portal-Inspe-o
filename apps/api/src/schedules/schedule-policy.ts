import { BadRequestException } from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { User } from '../identity/user.entity.js';
import { Unit } from '../organization/unit.entity.js';
import { Sector } from '../organization/sector.entity.js';
import { FormTemplate } from '../forms/entities/form-template.entity.js';
import { SectorMembership } from '../organization/membership.entity.js';
/** Same user→unit→sector order used by membership mutations prevents revocation races. */
export async function validateOperational(
  em: EntityManager,
  input: { unitId: string; sectorId: string; formId: string; responsibleIds: string[] },
  actorId?: string,
) {
  const users: User[] = [];
  for (const id of [...new Set([...input.responsibleIds, ...(actorId ? [actorId] : [])])].sort()) {
    const user = await em.findOne(User, id, {
      lockMode: LockMode.PESSIMISTIC_WRITE,
      refresh: true,
    });
    if (!user || !user.isActive || user.mustChangePassword)
      throw new BadRequestException('Responsáveis precisam estar ativos e com senha definitiva.');
    users.push(user);
  }
  const unit = await em.findOne(
    Unit,
    { id: input.unitId, isActive: true },
    { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
  );
  const sector = await em.findOne(
    Sector,
    { id: input.sectorId, unit: input.unitId, isActive: true },
    { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
  );
  if (!unit || !sector)
    throw new BadRequestException('Selecione unidade e setor ativos e compatíveis.');
  for (const user of users) {
    if (user.role === 'ADMIN') continue;
    const granted = await em.count(SectorMembership, {
      sector: sector.id,
      isActive: true,
      unitMembership: { user: user.id, unit: unit.id, isActive: true },
    });
    if (!granted)
      throw new BadRequestException(
        'Responsáveis e gestor precisam de acesso ao setor selecionado.',
      );
  }
  const form = await em.findOne(
    FormTemplate,
    { id: input.formId, state: 'PUBLISHED' },
    { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
  );
  if (!form || !form.latestVersion)
    throw new BadRequestException('Selecione um formulário publicado.');
  return {
    unit,
    sector,
    form,
    users: users.filter((user) => input.responsibleIds.includes(user.id)),
  };
}
