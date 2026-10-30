'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { InspectionView, Paginated, SectorSummary } from '@portal/contracts';
import { useResource } from '../shared/use-resource';
import { kindLabels, type AvailableTypes } from '../shared/inspection-kinds';
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
  const [kind, setKind] = useState(''),
    [legacy, setLegacy] = useState(false);
  const types = useResource<AvailableTypes>(
    unit ? `forms/available-types?unitId=${unit}` : null,
    lookupRevision,
  );
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
    if (!sector) next['inspection-sector'] = 'Selecione um setor.';
    if (!form) next['inspection-form'] = 'Selecione um formulário publicado.';
    Object.assign(next, identificationErrors(identification, context.required));
    if (context.loading) return;
    if (context.error) {
      setError(context.error);
      return;
    }
    if (types.error) {
      setError(types.error);
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
        <a href="/inspections">← Inspeções</a>
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
              setKind('');
              setLegacy(false);
              setDirty(true);
            }}
          />
          <p className="muted">Alterar a unidade limpa a seleção de setor.</p>
          {unit && (
            <RemotePicker
              key={unit}
              id="inspection-sector"
              label="Setor"
              endpoint={`organization/sectors?unitId=${unit}`}
              value={sector}
              error={errors['inspection-sector']}
              onChange={(id) => {
                setSector(id);
                setDirty(true);
              }}
            />
          )}
          {!unit && <p>Selecione uma unidade para escolher o setor.</p>}
          {unit && context.required && (
            <IdentificationFields
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
          {unit &&
            types.data?.configured &&
            (!context.required || (identification.customerId && identification.locationId)) && (
              <fieldset className="picker">
                <legend>Tipo de inspeção</legend>
                <div className="summary-grid">
                  {types.data.types.map((type) => (
                    <Button
                      key={type.kind}
                      type="button"
                      className="inspection-type"
                      variant="secondary"
                      aria-pressed={kind === type.kind && !legacy}
                      disabled={!type.count}
                      onClick={() => {
                        setKind(type.kind);
                        setLegacy(false);
                        setForm(type.formId ?? '');
                        setDirty(true);
                      }}
                    >
                      <strong>{kindLabels[type.kind]}</strong>
                      <span>
                        {!type.count
                          ? 'Sem formulário publicado'
                          : kind === type.kind && !legacy
                            ? 'Selecionado'
                            : `${type.count} modelo(s) disponível(is)`}
                      </span>
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setLegacy(true);
                    setKind('');
                    setForm('');
                  }}
                >
                  Usar outra ficha publicada
                </Button>
              </fieldset>
            )}
          {unit &&
            types.data?.configured &&
            context.required &&
            (!identification.customerId || !identification.locationId) && (
              <p>Selecione cliente e local para escolher o tipo de inspeção.</p>
            )}
          {types.error !== undefined && (
            <>
              <ErrorNotice error={types.error} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLookupRevision(lookupRevision + 1)}
              >
                Tentar carregar tipos novamente
              </Button>
            </>
          )}
          {(!types.data?.configured || kind || legacy) && (
            <RemotePicker
              id="inspection-form"
              label="Formulário"
              endpoint={`forms?state=PUBLISHED${unit ? `&unitId=${unit}` : ''}${kind && !legacy ? `&inspectionKind=${kind}` : ''}`}
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
            <Button type="submit" disabled={context.loading || (!!unit && types.loading)}>
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
