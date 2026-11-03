import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { FormTemplate } from './entities/form-template.entity.js';
import { FormUnitBinding } from './entities/form-unit.entity.js';
/** Legacy global models remain compatible; typed imported models require an explicit unit binding. */
export async function assertFormAvailable(
  em: EntityManager,
  form: FormTemplate,
  unitId: string,
  inspectionTypeId?: string,
) {
  if (form.deletedAt) throw new BadRequestException('Este formulário foi removido.');
  if (form.inspectionType) {
    await em.populate(form, ['inspectionType']);
    if (
      !form.inspectionType.isActive ||
      form.inspectionType.unit.id !== unitId ||
      form.inspectionType.id !== inspectionTypeId
    )
      throw new BadRequestException('O formulário não pertence ao tipo de inspeção selecionado.');
    return;
  }
  if (
    form.inspectionKind &&
    !(await em.count(FormUnitBinding, { form: form.id, unit: unitId, isActive: true }))
  )
    throw new BadRequestException(
      'Este tipo de formulário não está disponível na unidade selecionada.',
    );
}
