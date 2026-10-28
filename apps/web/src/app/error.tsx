'use client';
import { Button } from '@portal/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Não foi possível abrir esta página</h1>
      <p>Confira sua conexão e tente novamente em instantes.</p>
      <div className="actions">
        <Button onClick={reset}>Tentar novamente</Button>
        <a href="/dashboard">Voltar ao portal</a>
      </div>
    </main>
  );
}
