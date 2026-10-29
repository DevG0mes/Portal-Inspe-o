'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Notice, Skeleton } from '@portal/ui';
import { api } from '../../lib/api-client';
import { ErrorNotice } from '../shared/error-notice';
import { PrivateDownload } from '../shared/private-download';
import { Pagination } from '../shared/pagination';
import { localInstant } from '../schedules/presentation';
import { useReports } from './use-reports';
const states = {
  QUEUED: 'Na fila',
  PROCESSING: 'Gerando arquivo',
  READY: 'Pronto',
  FAILED: 'Falha na geração',
};
const errors = {
  REQUEST_INCOMPLETE: 'O pedido foi interrompido durante a preparação. Solicite um novo relatório.',
  ACCESS_CHANGED: 'Seu acesso mudou. Confira seus vínculos antes de solicitar outro relatório.',
  TOO_LARGE: 'O arquivo excedeu os limites. Solicite um novo com um recorte menor.',
  GENERATION_FAILED: 'Não foi possível gerar o arquivo. Você pode tentar novamente.',
};
export function ReportCenter() {
  const params = useSearchParams(),
    router = useRouter(),
    page = Math.max(1, Number(params.get('page')) || 1),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState<string>(),
    [error, setError] = useState<unknown>(),
    result = useReports(page, revision);
  async function retry(id: string) {
    if (busy) return;
    setBusy(id);
    setError(undefined);
    try {
      await api(`reports/${id}/retry`, { method: 'POST', body: '{}' });
      setRevision((r) => r + 1);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">DOCUMENTOS · EXPORTAÇÕES</span>
        <h1>Meus relatórios</h1>
        <p>
          Somente seus pedidos aparecem aqui. A geração acontece em segundo plano; dados e filtros
          ficam congelados na solicitação.
        </p>
      </div>
      <div className="actions">
        <a href="/dashboard">Solicitar Excel pelo painel</a>
        <a href="/inspections">Solicitar PDF pela inspeção</a>
        <Button
          variant="secondary"
          disabled={result.loading}
          onClick={() => setRevision((r) => r + 1)}
        >
          Atualizar relatórios
        </Button>
      </div>
      <p className="muted">
        Enquanto houver pedidos pendentes nesta página, a consulta atualiza a cada 5–15 segundos com
        a aba visível. Você pode sair e voltar.
      </p>
      {error !== undefined && <ErrorNotice error={error} />}
      <section className="card list-card" aria-busy={result.loading}>
        {result.error !== undefined && <ErrorNotice error={result.error} />}{' '}
        {!result.data && result.loading ? (
          <Skeleton />
        ) : (
          result.data && (
            <>
              {result.data.data.length ? (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Relatórios solicitados por você</caption>
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Situação</th>
                        <th>Arquivo</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.data.map((r) => (
                        <tr
                          key={r.id}
                          id={`report-${r.id}`}
                          aria-current={params.get('report') === r.id ? 'true' : undefined}
                        >
                          <td data-label="Pedido">
                            <strong>
                              {r.format === 'PDF' ? 'Inspeção — PDF' : 'Indicadores — Excel'}
                            </strong>
                            <span className="cell-detail">
                              {localInstant(r.createdAt)} · {r.id.slice(0, 8)}
                            </span>
                          </td>
                          <td data-label="Situação">
                            <span className="badge">{states[r.state]}</span>
                            {r.errorCode && <p>{errors[r.errorCode]}</p>}
                          </td>
                          <td data-label="Arquivo">
                            {r.size === null
                              ? 'Aguardando geração'
                              : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(r.size / 1024)} KiB`}
                            {r.completedAt && (
                              <span className="cell-detail">
                                Gerado em {localInstant(r.completedAt)}
                              </span>
                            )}
                            {r.sha256 && (
                              <details>
                                <summary>Integridade</summary>
                                <span className="cell-detail">SHA-256: {r.sha256}</span>
                              </details>
                            )}
                          </td>
                          <td data-label="Ações">
                            {r.state === 'READY' && (
                              <PrivateDownload
                                endpoint={`reports/${r.id}/download`}
                                method="POST"
                                filename={`relatório ${r.format}`}
                              />
                            )}{' '}
                            {r.canRetry && (
                              <Button
                                variant="secondary"
                                disabled={!!busy}
                                onClick={() => retry(r.id)}
                              >
                                {busy === r.id ? 'Solicitando…' : 'Tentar geração novamente'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Notice>Nenhum relatório solicitado.</Notice>
              )}
              <Pagination
                page={page}
                pageSize={10}
                total={result.data.total}
                onPage={(value) => router.replace(`/reports?page=${value}`, { scroll: false })}
              />
            </>
          )
        )}
      </section>
    </>
  );
}
