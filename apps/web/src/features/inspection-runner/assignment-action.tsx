'use client';
import { useState } from 'react';
import type { AssignmentSummary, InspectionView } from '@portal/contracts';
import { Button } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ErrorNotice } from '../shared/error-notice';
export function AssignmentAction({ assignment }: { assignment: AssignmentSummary }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  async function start() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const inspection = await api<InspectionView>('inspections', {
        method: 'POST',
        body: JSON.stringify({ assignmentId: assignment.id }),
      });
      // A document navigation gives the runner a real predecessor for beforeunload protection.
      window.location.assign(`/inspections/${inspection.id}`);
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }
  if (assignment.inspectionId)
    return (
      <a href={`/inspections/${assignment.inspectionId}`}>
        {assignment.inspectionState === 'COMPLETED' ? 'Consultar inspeção' : 'Continuar inspeção'}
      </a>
    );
  return (
    <>
      {assignment.canStart ? (
        <Button disabled={busy} onClick={start}>
          {busy ? 'Iniciando…' : 'Iniciar inspeção'}
        </Button>
      ) : (
        <span className="muted">
          {assignment.state === 'UPCOMING'
            ? 'Disponível no horário da ocorrência'
            : assignment.state === 'CANCELLED'
              ? 'Cancelada'
              : 'Aguardando responsável'}
        </span>
      )}
      {error !== undefined && <ErrorNotice error={error} />}
    </>
  );
}
