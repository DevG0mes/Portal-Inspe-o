'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { InspectionView } from '@portal/contracts';
import { Button } from '@portal/ui';
import { api } from '../../lib/api-client';
import { RemotePicker } from '../shared/remote-picker';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { DirtyGuard } from '../shared/dirty-guard';
import { ErrorNotice } from '../shared/error-notice';
import { useHydrated } from '../shared/use-hydrated';
export function InspectionCreate() {
  const router = useRouter(),
    hydrated = useHydrated();
  const [unit, setUnit] = useState(''),
    [sector, setSector] = useState(''),
    [form, setForm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [dirty, setDirty] = useState(false);
  function review(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (!unit) next['inspection-unit'] = 'Selecione uma unidade.';
    if (!sector) next['inspection-sector'] = 'Selecione um setor.';
    if (!form) next['inspection-form'] = 'Selecione um formulário publicado.';
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
        body: JSON.stringify({ unitId: unit, sectorId: sector, formId: form }),
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
          <RemotePicker
            id="inspection-form"
            label="Formulário"
            endpoint="forms?state=PUBLISHED"
            activeOnly={false}
            value={form}
            error={errors['inspection-form']}
            onChange={(id) => {
              setForm(id);
              setDirty(true);
            }}
          />
          <div className="actions">
            <Button type="submit">Revisar inspeção</Button>
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
