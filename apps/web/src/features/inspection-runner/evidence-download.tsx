'use client';
import { useEffect, useState } from 'react';
import type { EvidenceFile } from '@portal/contracts';
import { Button } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ErrorNotice } from '../shared/error-notice';
export function EvidenceDownload({ file }: { file: EvidenceFile }) {
  const [url, setUrl] = useState<string>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    if (url) {
      const timer = setTimeout(() => setUrl(undefined), 55000);
      return () => clearTimeout(timer);
    }
  }, [url]);
  async function prepare() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<{ url: string }>(`files/${file.id}/download`);
      if (!['http:', 'https:'].includes(new URL(result.url).protocol))
        throw new Error('Link de download inválido.');
      setUrl(result.url);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {url ? (
        <>
          <a href={url} target="_blank" rel="noreferrer">
            Baixar {file.filename}
          </a>
          <small className="cell-detail">Link privado disponível por até 60 segundos.</small>
        </>
      ) : (
        <Button variant="secondary" disabled={busy} onClick={prepare}>
          {busy ? 'Preparando…' : `Preparar download de ${file.filename}`}
        </Button>
      )}
      {error !== undefined && <ErrorNotice error={error} />}
    </div>
  );
}
