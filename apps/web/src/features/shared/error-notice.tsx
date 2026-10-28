import { Notice } from '@portal/ui';
import { ApiError } from '../../lib/api-client';
export function ErrorNotice({ error }: { error: unknown }) {
  return (
    <Notice error>
      {error instanceof Error ? error.message : 'Não foi possível carregar os dados.'}
      {error instanceof ApiError && error.status === 401 && (
        <>
          {' '}
          <a href="/login" target="_blank" rel="noopener">
            Entrar em outra aba
          </a>{' '}
          e depois tentar novamente.
        </>
      )}
      {error instanceof ApiError && error.requestId && (
        <small className="request-id">Referência: {error.requestId}</small>
      )}
    </Notice>
  );
}
