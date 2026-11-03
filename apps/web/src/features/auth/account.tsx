'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ConfirmDialog } from '../shared/confirm-dialog';
import { ErrorNotice } from '../shared/error-notice';
export function Account() {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function logout(all: boolean) {
    setBusy(true);
    try {
      await api(all ? 'auth/logout-all' : 'auth/logout', { method: 'POST', body: '{}' });
      window.location.assign('/login');
    } catch (failure) {
      setError(failure);
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card">
        <h2>Visualização do portal</h2>
        <p>Alterne entre Desktop e Celular quando quiser.</p>
        <Link className="button secondary" href="/experience">
          Trocar visualização
        </Link>
      </section>
      <section className="card">
        <h2>Segurança da conta</h2>
        <p>
          A alteração de senha encerra as outras sessões. Você também pode encerrar todos os
          acessos, incluindo este.
        </p>
        <div className="actions">
          <Link className="button primary" href="/change-password">
            Alterar senha
          </Link>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            Encerrar todas as sessões
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => logout(false)}>
            Sair deste dispositivo
          </Button>
        </div>
        {!confirm && error !== undefined && <ErrorNotice error={error} />}
      </section>
      <ConfirmDialog
        open={confirm}
        title="Encerrar todas as sessões?"
        onCancel={() => setConfirm(false)}
        onConfirm={() => logout(true)}
        busy={busy}
        confirmLabel="Encerrar sessões"
      >
        <p>Você e os demais dispositivos precisarão entrar novamente.</p>
        {error !== undefined && <ErrorNotice error={error} />}
      </ConfirmDialog>
    </>
  );
}
