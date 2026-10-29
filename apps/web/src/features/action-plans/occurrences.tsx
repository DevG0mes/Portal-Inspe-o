'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { OccurrenceView, Paginated, ActionPlanView } from '@portal/contracts';
import { Button, Field, Input, Textarea, Select, Skeleton } from '@portal/ui';
import { api } from '../../lib/api-client';
import { useResource } from '../shared/use-resource';
import { RemotePicker } from '../shared/remote-picker';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { DirtyGuard } from '../shared/dirty-guard';
import { ErrorNotice } from '../shared/error-notice';
import { Pagination } from '../shared/pagination';
import { priorityLabels } from '../form-builder/model';
export function Occurrences() {
  const router = useRouter(),
    params = useSearchParams(),
    page = Math.max(1, Number(params.get('page')) || 1),
    [revision, setRevision] = useState(0);
  const resource = useResource<Paginated<OccurrenceView>>(
    `action-plans/occurrences?page=${page}&pageSize=10`,
    revision,
  );
  const [selected, setSelected] = useState<OccurrenceView>(),
    [responsible, setResponsible] = useState(''),
    [description, setDescription] = useState(''),
    [priority, setPriority] = useState('HIGH'),
    [date, setDate] = useState('');
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = !!selected && (!!responsible || !!description || !!date);
  function review() {
    const next: Record<string, string> = {};
    if (!responsible) next['action-responsible'] = 'Selecione um responsável.';
    if (description.trim().length < 5)
      next['action-description'] = 'Descreva a correção com pelo menos 5 caracteres.';
    if (!date) next['action-date'] = 'Informe o prazo.';
    setErrors(next);
    setError(undefined);
    if (Object.keys(next).length) {
      document.getElementById(Object.keys(next)[0]!)?.focus();
      return;
    }
    setConfirm(true);
  }
  async function create() {
    if (busy || !selected) return;
    setBusy(true);
    setError(undefined);
    try {
      const row = await api<ActionPlanView>('action-plans', {
        method: 'POST',
        body: JSON.stringify({
          sourceSubmissionId: selected.submissionId,
          questionId: selected.questionId,
          responsibleId: responsible,
          description: description.trim(),
          priority,
          dueDate: date,
        }),
      });
      setSelected(undefined);
      setConfirm(false);
      router.replace(`/action-plans/${row.id}`);
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <a href="/action-plans">← Planos de ação</a>
        <h1>Não conformidades sem plano</h1>
        <p>Defina a correção, o responsável e o prazo para uma ocorrência concluída.</p>
      </div>
      {!selected ? (
        <section className="card">
          <Button
            variant="secondary"
            disabled={resource.loading}
            onClick={() => setRevision(revision + 1)}
          >
            Atualizar ocorrências
          </Button>
          {resource.loading ? (
            <Skeleton />
          ) : resource.error ? (
            <ErrorNotice error={resource.error} />
          ) : (
            resource.data && (
              <>
                {!resource.data.data.length ? (
                  <div className="empty-state">
                    <h2>Nenhuma ocorrência sem plano</h2>
                    <p>As ocorrências configuradas aparecem após concluir uma inspeção.</p>
                  </div>
                ) : (
                  <ul className="occurrence-list">
                    {resource.data.data.map((row) => (
                      <li key={`${row.submissionId}-${row.questionId}`}>
                        <h2>{row.questionLabel}</h2>
                        <p>
                          {row.inspectionTitle} · {row.unitName} · {row.sectorName}
                        </p>
                        <p>
                          {row.category} · Prioridade {priorityLabels[row.priority].toLowerCase()}
                        </p>
                        <Button
                          onClick={() => {
                            setSelected(row);
                            setPriority(row.priority);
                            setResponsible('');
                            setDescription('');
                            setDate('');
                            setErrors({});
                          }}
                        >
                          Planejar correção<span className="sr-only"> de {row.questionLabel}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <Pagination
                  page={page}
                  pageSize={10}
                  total={resource.data.total}
                  onPage={(page) =>
                    router.replace(`/action-plans/occurrences?page=${page}`, { scroll: false })
                  }
                />
              </>
            )
          )}
        </section>
      ) : (
        <form
          className="card editor"
          noValidate
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            review();
          }}
        >
          <h2>{selected.questionLabel}</h2>
          <p>
            {selected.unitName} · {selected.sectorName} · {selected.category}
          </p>
          <fieldset disabled={busy || confirm}>
            <Field
              id="action-description"
              label="Descrição da correção"
              error={errors['action-description']}
            >
              <Textarea
                className="resize-none"
                id="action-description"
                maxLength={5000}
                value={description}
                aria-invalid={!!errors['action-description']}
                aria-describedby={
                  errors['action-description'] ? 'action-description-error' : undefined
                }
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <RemotePicker
              id="action-responsible"
              label="Responsável"
              endpoint={`schedules/candidates?unitId=${selected.unitId}&sectorId=${selected.sectorId}`}
              activeOnly={false}
              value={responsible}
              error={errors['action-responsible']}
              onChange={(id) => setResponsible(id)}
            />
            <Field
              id="action-date"
              label="Prazo da correção"
              error={errors['action-date']}
              hint="Data inclusiva em São Paulo."
            >
              <Input
                id="action-date"
                type="date"
                value={date}
                aria-invalid={!!errors['action-date']}
                aria-describedby={errors['action-date'] ? 'action-date-error' : 'action-date-hint'}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field id="action-priority" label="Prioridade">
              <Select
                id="action-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="actions">
              <Button type="submit">Revisar plano</Button>
              <a className="button secondary" href="/action-plans/occurrences">
                Cancelar
              </a>
            </div>
          </fieldset>
        </form>
      )}
      <ConfirmDialog
        open={confirm}
        busy={busy}
        title="Criar este plano de ação?"
        confirmLabel="Criar plano"
        onCancel={() => setConfirm(false)}
        onConfirm={create}
      >
        <p>
          A ocorrência ficará ligada a esta correção, com responsável e prazo registrados no
          histórico.
        </p>
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
      <DirtyGuard dirty={dirty} busy={busy} />
    </>
  );
}
