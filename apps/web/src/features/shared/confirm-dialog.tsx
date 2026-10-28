'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '@portal/ui';
export function ConfirmDialog({
  open,
  title,
  children,
  busy = false,
  confirmLabel = 'Confirmar',
  danger = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  busy?: boolean;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={id}>{title}</h2>
      <div>{children}</div>
      <div className="actions">
        <button
          className="button secondary"
          ref={cancelRef}
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </button>
        <Button
          type="button"
          variant={danger ? 'danger' : 'primary'}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Aguarde…' : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
