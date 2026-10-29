'use client';
import { useState } from 'react';
import { Button, Notice } from '@portal/ui';
import type { ReportFilters, ReportView } from '@portal/contracts';
import { api } from '../../lib/api-client';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { ErrorNotice } from '../shared/error-notice';
import { priorityLabels } from '../form-builder/model';
type Input =
  | { format: 'PDF'; inspectionId: string; submissionId: string }
  | { format: 'XLSX'; filters: ReportFilters };
export function ReportRequestButton({ input, label }: { input: Input; label: string }) {
  const [pending, setPending] = useState<Input & { requestId: string }>(),
    [busy, setBusy] = useState(false),
    [completed, setCompleted] = useState<string>(),
    [error, setError] = useState<unknown>();
  async function send() {
    if (!pending || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<ReportView>('reports', { method: 'POST', body: JSON.stringify(pending) });
      setCompleted(r.id);
      setPending(undefined);
      setBusy(false);
      window.location.assign(`/reports?report=${r.id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setPending({ ...input, requestId: crypto.randomUUID() });
          setError(undefined);
        }}
        disabled={busy}
      >
        {label}
      </Button>
      {completed && (
        <Notice>
          Relatório solicitado. <a href={`/reports?report=${completed}`}>Abrir Meus relatórios</a>
        </Notice>
      )}
      <ConfirmDialog
        open={!!pending}
        busy={busy}
        title="Solicitar relatório?"
        confirmLabel="Solicitar relatório"
        onCancel={() => setPending(undefined)}
        onConfirm={send}
      >
        <p>
          {input.format === 'PDF'
            ? 'O PDF registrará esta conclusão e os planos de ação visíveis para você.'
            : 'O Excel registrará os indicadores e detalhes do recorte aplicado ao painel.'}
        </p>
        <p>O processamento acontece em segundo plano. O download revalida seu acesso atual.</p>
        {pending?.format === 'XLSX' && (
          <p>
            Período: {pending.filters.from?.split('-').reverse().join('/') ?? 'últimos 30 dias'} a{' '}
            {pending.filters.to?.split('-').reverse().join('/') ?? 'hoje'}.{' '}
            {pending.filters.category && `Categoria: ${pending.filters.category}. `}
            {pending.filters.priority && `Prioridade: ${priorityLabels[pending.filters.priority]}.`}
          </p>
        )}
        {pending && error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
    </>
  );
}
