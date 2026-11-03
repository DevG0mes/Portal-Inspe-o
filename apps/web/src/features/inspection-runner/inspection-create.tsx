'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { InspectionView, Paginated, SectorSummary } from '@portal/contracts';
import { useResource } from '../shared/use-resource';
import { Button } from '@portal/ui';
import { api } from '../../lib/api-client';
import { RemotePicker } from '../shared/remote-picker';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { DirtyGuard } from '../shared/dirty-guard';
import { ErrorNotice } from '../shared/error-notice';
import { useHydrated } from '../shared/use-hydrated';
import {
  IdentificationFields,
  emptyIdentification,
  identificationErrors,
  identificationPayload,
  useIdentification,
} from '../shared/identification-fields';
export function InspectionCreate() {
  const router = useRouter(),
    hydrated = useHydrated();
  const params = useSearchParams();
  const [unit, setUnit] = useState(params.get('unitId') ?? ''),
    [sector, setSector] = useState(''),
    [form, setForm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [dirty, setDirty] = useState(false);
  const [identification, setIdentification] = useState(emptyIdentification),
    [lookupRevision, setLookupRevision] = useState(0);
  const context = useIdentification(unit, form, lookupRevision);
  const sectors = useResource<Paginated<SectorSummary>>(
    unit && params.get('unitId')
      ? `organization/sectors?unitId=${unit}&isActive=true&pageSize=2`
      : null,
  );
  useEffect(() => {
    if (!sector && sectors.data?.total === 1) setSector(sectors.data.data[0]!.id);
  }, [sector, sectors.data]);
  function review(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (!unit) next['inspection-unit'] = 'Selecione uma unidade.';
    if (!sector) next['inspection-sector'] = 'Selecione um tipo de inspeção.';
    if (!form) next['inspection-form'] = 'Selecione um formulário publicado.';
    Object.assign(next, identificationErrors(identification, context.required));
    if (context.loading) return;
    if (context.error) {
      setError(context.error);
      return;
    }
    setErrors(next);
    setError(undefined);
    if (Object.keys(next).length) {
      document.getElementById(Object.keys(next)[0]!)?.focus();
      return;
    }
    setConfirm(true);
  }
  async function create() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const row = await api<InspectionView>('inspections', {
        method: 'POST',
        body: JSON.stringify({
          unitId: unit,
          sectorId: sector,
          formId: form,
          ...(identification.customerId ? { context: identificationPayload(identification) } : {}),
        }),
      });
      setDirty(false);
      setConfirm(false);
      router.replace(`/inspections/${row.id}`);
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <a className="back-link" href="/inspections">
          <span className="back-link-arrow" aria-hidden="true">
            ←
          </span>
          Inspeções
        </a>
        <h1>Nova inspeção avulsa</h1>
        <p>Escolha o local e a ficha publicada. A versão utilizada fica preservada no registro.</p>
      </div>
      <form className="card editor" noValidate method="post" onSubmit={review}>
        <fieldset disabled={!hydrated || busy || confirm}>
          <RemotePicker
            id="inspection-unit"
            label="Unidade"
            endpoint="organization/units"
            value={unit}
            error={errors['inspection-unit']}
            onChange={(id) => {
              setUnit(id);
              setSector('');
              setForm('');
              setIdentification(emptyIdentification());
              setDirty(true);
            }}
          />
          <p className="muted">
            Alterar a unidade limpa o tipo de inspeção e o formulário selecionados.
          </p>
          {unit && (
            <RemotePicker
              key={unit}
              id="inspection-sector"
              label="Tipo de inspeção"
              endpoint={`organization/sectors?unitId=${unit}`}
              value={sector}
              error={errors['inspection-sector']}
              onChange={(id) => {
                setSector(id);
                setForm('');
                setDirty(true);
              }}
            />
          )}
          {!unit && <p>Selecione uma unidade para escolher o tipo de inspeção.</p>}
          {unit && context.required && (
            <IdentificationFields
              address={context.address}
              unit={unit}
              value={identification}
              onChange={(value) => {
                setIdentification(value);
                setDirty(true);
              }}
              errors={errors}
            />
          )}
          {context.error !== undefined && (
            <>
              <ErrorNotice error={context.error} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLookupRevision(lookupRevision + 1)}
              >
                Tentar carregar identificação novamente
              </Button>
            </>
          )}
          {unit && sector && (
            <RemotePicker
              id="inspection-form"
              label="Formulário"
              endpoint={`forms?state=PUBLISHED&unitId=${unit}&inspectionTypeId=${sector}`}
              activeOnly={false}
              value={form}
              error={errors['inspection-form']}
              onChange={(id) => {
                setForm(id);
                setDirty(true);
              }}
            />
          )}
          <div className="actions">
            <Button type="submit" disabled={context.loading}>
              Revisar inspeção
            </Button>
            <a className="button secondary" href="/inspections">
              Cancelar
            </a>
          </div>
        </fieldset>
      </form>
      <ConfirmDialog
        open={confirm}
        busy={busy}
        title="Iniciar esta inspeção?"
        confirmLabel="Iniciar preenchimento"
        onCancel={() => setConfirm(false)}
        onConfirm={create}
      >
        <p>
          A ficha será fixada na versão publicada atual. Você poderá preencher e salvar as respostas
          em etapas.
        </p>
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
      <DirtyGuard dirty={dirty} busy={busy} />
    </>
  );
}
