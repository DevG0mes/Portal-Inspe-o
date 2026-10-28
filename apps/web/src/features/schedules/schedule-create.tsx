'use client';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Select } from '@portal/ui';
import type { Frequency, ScheduleSummary } from '@portal/contracts';
import { occurrence, validDate } from '@portal/scheduling';
import { api } from '../../lib/api-client';
import { RemotePicker } from '../shared/remote-picker';
import { useHydrated } from '../shared/use-hydrated';
import { DirtyGuard } from '../shared/dirty-guard';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { ErrorNotice } from '../shared/error-notice';
import { frequencyLabels } from './presentation';
import { useRouter } from 'next/navigation';
export function ScheduleCreate() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [unit, setUnit] = useState(''),
    [sector, setSector] = useState(''),
    [form, setForm] = useState('');
  const [candidate, setCandidate] = useState({ id: '', name: '' });
  const [responsibles, setResponsibles] = useState<{ id: string; name: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, unknown>>();
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [error, setError] = useState<unknown>();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const body = {
      name: String(data.get('name') ?? '').trim(),
      unitId: unit,
      sectorId: sector,
      formId: form,
      responsibleIds: responsibles.map((user) => user.id),
      frequency: String(data.get('frequency')) as Frequency,
      startDate: String(data.get('startDate')),
      time: String(data.get('time')),
      endDate: String(data.get('endDate')) || null,
      deadlineHours: Number(data.get('deadlineHours')),
    };
    const next: Record<string, string> = {};
    if (!body.name) next.name = 'Informe o nome.';
    if (!unit) next.unit = 'Selecione uma unidade.';
    if (!sector) next.sector = 'Selecione um setor.';
    if (!form) next.form = 'Selecione um formulário publicado.';
    if (!responsibles.length) next.responsibles = 'Adicione ao menos um responsável.';
    if (!validDate(body.startDate)) next.startDate = 'Informe uma data válida.';
    else
      try {
        if (Date.parse(occurrence(body, body.startDate)) <= Date.now())
          next.startDate = 'O primeiro horário precisa estar no futuro.';
      } catch {
        next.time = 'Informe uma hora válida para São Paulo.';
      }
    if (body.endDate && (!validDate(body.endDate) || body.endDate < body.startDate))
      next.endDate = 'A vigência final deve ser igual ou posterior ao início.';
    if (
      !Number.isInteger(body.deadlineHours) ||
      body.deadlineHours < 1 ||
      body.deadlineHours > 8760
    )
      next.deadlineHours = 'Use de 1 a 8760 horas.';
    setErrors(next);
    setError(undefined);
    if (Object.keys(next).length) {
      document.getElementById(Object.keys(next)[0]!)?.focus();
      return;
    }
    setPending(body);
  }
  async function save() {
    if (!pending || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const created = await api<ScheduleSummary>('schedules', {
        method: 'POST',
        body: JSON.stringify(pending),
      });
      setDirty(false);
      setPending(undefined);
      router.replace(`/schedules/${created.id}`);
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <a href="/schedules">← Programações</a>
        <h1>Nova programação</h1>
        <p>
          Defina calendário, escopo e responsáveis. Horários de São Paulo; a primeira ocorrência
          deve estar no futuro.
        </p>
      </div>
      <form
        noValidate
        method="post"
        className="card editor"
        onSubmit={submit}
        onChange={() => setDirty(true)}
      >
        <fieldset disabled={busy || !hydrated}>
          <Field id="name" label="Nome" error={errors.name}>
            <Input
              id="name"
              name="name"
              maxLength={160}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
          </Field>
          <RemotePicker
            id="form"
            label="Formulário"
            endpoint="forms?state=PUBLISHED"
            activeOnly={false}
            value={form}
            error={errors.form}
            onChange={(value) => {
              setForm(value);
              setDirty(true);
            }}
          />
          <RemotePicker
            id="unit"
            label="Unidade"
            endpoint="organization/units"
            value={unit}
            error={errors.unit}
            onChange={(value) => {
              setUnit(value);
              setSector('');
              setResponsibles([]);
              setCandidate({ id: '', name: '' });
              setDirty(true);
            }}
          />
          {unit && (
            <RemotePicker
              key={unit}
              id="sector"
              label="Setor"
              endpoint={`organization/sectors?unitId=${unit}`}
              value={sector}
              error={errors.sector}
              onChange={(value) => {
                setSector(value);
                setResponsibles([]);
                setCandidate({ id: '', name: '' });
                setDirty(true);
              }}
            />
          )}
          <section id="responsibles" tabIndex={-1} aria-label="Responsáveis">
            <h2>Responsáveis</h2>
            <p className="small muted">
              Escolha pessoas com acesso ao setor. Alterar unidade ou setor limpa esta seleção.
              Todos compartilham a mesma ocorrência.
            </p>
            {sector && (
              <RemotePicker
                key={`${unit}-${sector}`}
                id="candidate"
                label="Responsável"
                endpoint={`schedules/candidates?unitId=${unit}&sectorId=${sector}`}
                activeOnly={false}
                value={candidate.id}
                onChange={(id, name) => setCandidate({ id, name })}
              />
            )}
            <Button
              variant="secondary"
              disabled={
                !candidate.id ||
                responsibles.some((user) => user.id === candidate.id) ||
                responsibles.length >= 50
              }
              onClick={() => {
                setResponsibles([...responsibles, candidate]);
                setDirty(true);
              }}
            >
              Adicionar responsável
            </Button>
            <ul className="responsible-list">
              {responsibles.map((user) => (
                <li key={user.id}>
                  {user.name}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setResponsibles(responsibles.filter((item) => item.id !== user.id));
                      setDirty(true);
                    }}
                  >
                    Remover<span className="sr-only"> {user.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
            {errors.responsibles && <p className="field-error">{errors.responsibles}</p>}
          </section>
          <Field id="frequency" label="Frequência">
            <Select id="frequency" name="frequency" defaultValue="ONCE">
              {Object.entries(frequencyLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="schedule-date-grid">
            {[
              { id: 'startDate', label: 'Data inicial', type: 'date' },
              { id: 'time', label: 'Hora local', type: 'time' },
              { id: 'endDate', label: 'Fim da vigência (opcional)', type: 'date' },
              { id: 'deadlineHours', label: 'Prazo (horas corridas)', type: 'number' },
            ].map((field) => (
              <Field key={field.id} id={field.id} label={field.label} error={errors[field.id]}>
                <Input
                  id={field.id}
                  name={field.id}
                  type={field.type}
                  defaultValue={
                    field.id === 'time' ? '08:00' : field.id === 'deadlineHours' ? 24 : undefined
                  }
                  min={field.type === 'number' ? 1 : undefined}
                  max={field.type === 'number' ? 8760 : undefined}
                  aria-invalid={!!errors[field.id]}
                  aria-describedby={errors[field.id] ? `${field.id}-error` : undefined}
                />
              </Field>
            ))}
          </div>
          <p className="small muted">
            Mensal repete o dia inicial, usando o último dia nos meses mais curtos. O fim da
            vigência inclui o dia escolhido. Prazo contado em horas reais após cada ocorrência.
          </p>
          <Button type="submit" disabled={busy || !hydrated}>
            Revisar programação
          </Button>
        </fieldset>
        <div className="actions">
          <a href="/schedules">Cancelar</a>
        </div>
      </form>
      <DirtyGuard dirty={dirty} busy={busy} />
      <ConfirmDialog
        open={!!pending}
        busy={busy}
        title="Criar esta programação?"
        confirmLabel="Criar programação"
        onCancel={() => setPending(undefined)}
        onConfirm={save}
      >
        <p>
          <strong>{String(pending?.name ?? '')}</strong> ·{' '}
          {pending ? frequencyLabels[pending.frequency as Frequency] : ''}
        </p>
        <p>
          Início: {String(pending?.startDate ?? '')} às {String(pending?.time ?? '')} (São Paulo).
          Prazo: {String(pending?.deadlineHours ?? '')} horas.
        </p>
        <p>
          Formulário, escopo, responsáveis e calendário ficarão fixos. Você poderá renomear, pausar
          e retomar. As ocorrências serão preparadas até sete dias à frente.
        </p>
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
    </>
  );
}
