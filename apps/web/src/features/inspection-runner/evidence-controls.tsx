'use client';
import { useEffect, useRef, useState } from 'react';
import type { EvidenceFile, EvidenceReceipt, UploadPolicy } from '@portal/contracts';
import { Button, Field, Input } from '@portal/ui';
import { api } from '../../lib/api-client';
import { uploadEvidence } from '../../lib/upload-client';
import { ErrorNotice } from '../shared/error-notice';
import { EvidenceDownload } from './evidence-download';
export function EvidenceControls({
  inspectionId,
  questionId,
  questionLabel,
  files,
  policy,
  onBegin,
  onEnd,
  onPending,
  onReceipt,
  onRemove,
  onSelection,
  onFailure,
}: {
  inspectionId: string;
  questionId: string;
  questionLabel: string;
  files: EvidenceFile[];
  policy?: UploadPolicy;
  onBegin: () => Promise<number | undefined>;
  onEnd: () => void;
  onPending: (file: EvidenceFile) => void;
  onReceipt: (expected: number, result: EvidenceReceipt) => void;
  onRemove: (file: EvidenceFile) => void;
  onSelection: (selected: boolean) => void;
  onFailure: (error: unknown) => void;
}) {
  const [selected, setSelected] = useState<File>(),
    [uploadId, setUploadId] = useState(''),
    [prepared, setPrepared] = useState<string>(),
    [uploaded, setUploaded] = useState(false);
  const [phase, setPhase] = useState(''),
    [error, setError] = useState<unknown>(),
    [localUrl, setLocalUrl] = useState<string>();
  const input = useRef<HTMLInputElement>(null),
    selectionCallback = useRef(onSelection);
  useEffect(() => {
    selectionCallback.current = onSelection;
  });
  useEffect(() => () => selectionCallback.current(false), []);
  useEffect(() => {
    if (!selected) {
      setLocalUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(selected);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selected]);
  function clear() {
    setSelected(undefined);
    setPrepared(undefined);
    setUploaded(false);
    setPhase('');
    setError(undefined);
    onSelection(false);
    if (input.current) input.current.value = '';
  }
  useEffect(() => {
    if (prepared && !files.some((file) => file.id === prepared)) {
      setPrepared(undefined);
      setSelected(undefined);
      setUploaded(false);
      setPhase('');
      selectionCallback.current(false);
      if (input.current) input.current.value = '';
    }
  }, [files, prepared]);
  async function send() {
    if (!selected || !policy || phase) return;
    if (
      !policy.allowedMimeTypes.includes(selected.type) ||
      selected.size > policy.maxBytes ||
      selected.size === 0
    ) {
      setError(new Error('Use JPEG, PNG, WEBP ou PDF dentro do limite informado.'));
      return;
    }
    const revision = await onBegin();
    if (revision === undefined) return;
    setError(undefined);
    setPhase('Preparando envio…');
    try {
      let id = prepared;
      if (!id) {
        const result = await api<{ id: string; expiresAt: string }>('files/prepare', {
          method: 'POST',
          body: JSON.stringify({
            uploadId,
            inspectionId,
            questionId,
            revision,
            filename: selected.name,
            mime: selected.type,
            size: selected.size,
          }),
        });
        id = result.id;
        onPending({
          id,
          questionId,
          filename: selected.name,
          mime: selected.type,
          size: selected.size,
          sha256: null,
          status: 'PENDING',
          expiresAt: result.expiresAt,
        });
        setPrepared(id);
      }
      if (!uploaded) {
        setPhase('Transferindo para o portal: 0%');
        await uploadEvidence(id, selected, (percent) =>
          setPhase(`Transferindo para o portal: ${percent}%`),
        );
        setUploaded(true);
      }
      setPhase('Validando e finalizando evidência…');
      const receipt = await api<EvidenceReceipt>(`files/${id}/finalize`, {
        method: 'POST',
        body: JSON.stringify({ revision }),
      });
      onReceipt(revision, receipt);
      clear();
    } catch (failure) {
      setError(failure);
      onFailure(failure);
    } finally {
      setPhase('');
      onEnd();
    }
  }
  const id = `evidence-${questionId}`;
  return (
    <section className="evidence-controls" aria-label={`Evidências de ${questionLabel}`}>
      <Field
        id={id}
        label={`Evidência · ${questionLabel}`}
        hint={
          policy
            ? `JPEG, PNG, WEBP ou PDF. Até ${Math.floor(policy.maxBytes / 1024 / 1024)} MiB por arquivo; 5 por pergunta.`
            : 'Carregando limites de envio…'
        }
      >
        <Input
          ref={input}
          id={id}
          type="file"
          accept={policy?.accept}
          disabled={!policy || !!prepared}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setSelected(file);
            setUploadId(crypto.randomUUID());
            setUploaded(false);
            setError(undefined);
            onSelection(!!file);
          }}
        />
      </Field>
      {selected && (
        <>
          <div className="actions">
            <Button variant="secondary" disabled={!!phase} onClick={send}>
              {phase ? 'Enviando…' : prepared ? 'Tentar envio novamente' : 'Enviar arquivo'}
            </Button>
            {!prepared && (
              <Button variant="secondary" disabled={!!phase} onClick={clear}>
                Limpar seleção
              </Button>
            )}
            {localUrl && (
              <a href={localUrl} download={selected.name} target="_blank" rel="noopener">
                Salvar cópia do arquivo selecionado
              </a>
            )}
          </div>
          <p role="status">{phase || 'Arquivo selecionado; envio ainda não confirmado.'}</p>
        </>
      )}
      {error !== undefined && <ErrorNotice error={error} />}
      {files.length > 0 && (
        <ul className="evidence-list">
          {files.map((file) => (
            <li key={file.id}>
              <strong>{file.filename}</strong>
              <span className="cell-detail">
                {file.status === 'READY' ? 'Evidência registrada' : 'Envio pendente'} ·{' '}
                {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(
                  file.size / 1024,
                )}{' '}
                KiB
              </span>
              <div className="actions">
                {file.status === 'READY' && <EvidenceDownload file={file} />}
                <Button variant="secondary" onClick={() => onRemove(file)}>
                  {file.status === 'READY'
                    ? `Remover ${file.filename}`
                    : `Cancelar envio de ${file.filename}`}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
