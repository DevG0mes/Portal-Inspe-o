'use client';
import type { CustomerSummary, FormTemplateSummary, Paginated } from '@portal/contracts';
import { Field, Textarea } from '@portal/ui';
import { RemotePicker } from './remote-picker';
import { useResource } from './use-resource';
export interface IdentificationSelection {
  customerId: string;
  locationId: string;
  participantText: string;
}
export const emptyIdentification = (): IdentificationSelection => ({
  customerId: '',
  locationId: '',
  participantText: '',
});
export const identificationPayload = (value: IdentificationSelection) => ({
  customerId: value.customerId,
  locationId: value.locationId,
  participants: value.participantText
    .split('\n')
    .map((v) => v.trim().normalize('NFC'))
    .filter(Boolean),
});
export function identificationErrors(value: IdentificationSelection, required: boolean) {
  const errors: Record<string, string> = {};
  if (required || value.customerId || value.locationId) {
    if (!value.customerId) errors['inspection-customer'] = 'Selecione um cliente.';
    if (!value.locationId) errors['inspection-location'] = 'Selecione um local.';
  }
  const names = identificationPayload(value).participants;
  if (
    names.length > 20 ||
    names.some((n) => n.length > 160) ||
    new Set(names.map((n) => n.toLowerCase())).size !== names.length
  )
    errors['inspection-participants'] =
      'Use até 20 nomes distintos de até 160 caracteres, um por linha.';
  return errors;
}
export function useIdentification(unit: string, form: string, revision = 0) {
  const customers = useResource<Paginated<CustomerSummary> & { configured?: boolean }>(
    unit ? `organization/customers?unitId=${unit}&isActive=true&pageSize=1` : null,
    revision,
  );
  const model = useResource<FormTemplateSummary>(form ? `forms/${form}` : null, revision);
  return {
    typed: !!model.data?.inspectionKind,
    required: !!model.data?.inspectionKind || !!customers.data?.configured,
    loading: (!!unit && customers.loading) || (!!form && model.loading),
    error: customers.error ?? model.error,
  };
}
export function IdentificationFields({
  unit,
  value,
  onChange,
  errors,
}: {
  unit: string;
  value: IdentificationSelection;
  onChange: (value: IdentificationSelection) => void;
  errors: Record<string, string>;
}) {
  return (
    <fieldset className="picker">
      <legend>Identificação da inspeção</legend>
      <RemotePicker
        id="inspection-customer"
        label="Cliente"
        endpoint={`organization/customers?unitId=${unit}`}
        value={value.customerId}
        error={errors['inspection-customer']}
        onChange={(id) => onChange({ ...value, customerId: id, locationId: '' })}
      />
      {value.customerId ? (
        <RemotePicker
          key={value.customerId}
          id="inspection-location"
          label="Local"
          endpoint={`organization/locations?customerId=${value.customerId}&unitId=${unit}`}
          value={value.locationId}
          error={errors['inspection-location']}
          onChange={(id) => onChange({ ...value, locationId: id })}
        />
      ) : (
        <p>Selecione o cliente para escolher o local.</p>
      )}
      <Field
        id="inspection-participants"
        label="Participantes (opcional)"
        hint="Um nome por linha, até 20. O registro de participação não concede acesso ou edição e não envia convite."
        error={errors['inspection-participants']}
      >
        <Textarea
          id="inspection-participants"
          className="resize-none"
          value={value.participantText}
          maxLength={3400}
          rows={4}
          onChange={(e) => onChange({ ...value, participantText: e.target.value })}
          aria-invalid={!!errors['inspection-participants']}
          aria-describedby={
            errors['inspection-participants']
              ? 'inspection-participants-error'
              : 'inspection-participants-hint'
          }
        />
      </Field>
      <p>Cliente ou local não encontrado? Solicite o cadastro ao administrador.</p>
    </fieldset>
  );
}
