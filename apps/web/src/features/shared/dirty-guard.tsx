'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './confirm-dialog';
/** Intercepts same-document navigation only; browser owns actual tab/window closure. */
export function DirtyGuard({ dirty, busy = false }: { dirty: boolean; busy?: boolean }) {
  const [destination, setDestination] = useState<string>();
  const allowLeave = useRef(false);
  useLayoutEffect(() => {
    if (!dirty && !busy) return;
    function unload(event: BeforeUnloadEvent) {
      if (!allowLeave.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    function click(event: MouseEvent) {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === '_blank' ||
        (link.hash && link.pathname === location.pathname) ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!busy) setDestination(link.href);
    }
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, busy]);
  return (
    <ConfirmDialog
      open={!!destination}
      title="Descartar alterações?"
      confirmLabel="Descartar e sair"
      danger
      onCancel={() => setDestination(undefined)}
      onConfirm={() => {
        if (destination) {
          allowLeave.current = true;
          setDestination(undefined);
          window.location.assign(destination);
        }
      }}
    >
      <p>Existem alterações não salvas. Ao sair, elas serão descartadas.</p>
    </ConfirmDialog>
  );
}
