'use client';

import type { QssmaHistory } from '@portal/contracts';
import { useResource } from '../shared/use-resource';

import { QssmaHistoryCharts } from './qssma-charts';

export function QssmaHistoryPanel({ revision }: { revision: number }) {
  const { data, loading, error } = useResource<QssmaHistory>('analytics/qssma-history', revision);
  return (
    <section className="card">
      <h2>Histórico de inspeções · Power BI</h2>
      <p>Todo o período importado. Os filtros acima se aplicam às inspeções do portal.</p>
      {loading && <p role="status">Carregando histórico…</p>}
      {Boolean(error) && <p role="alert">Não foi possível carregar o histórico.</p>}
      {data &&
        (data.totals.inspections ? (
          <>
            <p>
              {data.totals.inspections} inspeções · {data.totals.deviations} desvios vinculados ·{' '}
              {data.totals.treated} tratados na origem
            </p>
            <p>
              {data.inspectionsWithDeviation} inspeções com desvio registrado ·{' '}
              {data.totals.deviations - data.totals.treated} desvios sem status Tratado na origem
            </p>
            <QssmaHistoryCharts data={data} />
            <p>
              Os desvios exibidos refletem a cobertura da exportação. A conformidade por respostas
              exige a base de respostas avaliáveis.
            </p>
          </>
        ) : (
          <p>Nenhum histórico importado.</p>
        ))}
    </section>
  );
}
