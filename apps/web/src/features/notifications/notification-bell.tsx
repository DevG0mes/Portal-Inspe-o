'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { NotificationCenter } from './notification-center';
import { UnreadIndicator } from './unread-indicator';

/** Native modal provides focus containment, Escape and background isolation. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    closeRef.current?.focus();
    return () => {
      dialog?.close();
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, [open]);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="notification-bell"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="sr-only">Notificações</span>
        <UnreadIndicator />
      </button>
      <dialog
        ref={dialogRef}
        id={id}
        className="notification-drawer"
        aria-labelledby={`${id}-title`}
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
      >
        <div className="notification-drawer-heading">
          <div>
            <span className="eyebrow">ACOMPANHAMENTO</span>
            <h2 id={`${id}-title`}>Notificações</h2>
          </div>
          <button
            type="button"
            className="button secondary"
            ref={closeRef}
            onClick={() => setOpen(false)}
          >
            Fechar
          </button>
        </div>
        <p>Atribuições, prazos e decisões do seu trabalho.</p>
        {open && <NotificationCenter embedded />}
      </dialog>
    </>
  );
}
