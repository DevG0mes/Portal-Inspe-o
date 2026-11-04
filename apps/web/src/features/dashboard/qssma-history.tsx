'use client';

import type { QssmaHistory, QssmaHistoryRow } from '@portal/contracts';
import { useResource } from '../shared/use-resource';

function HistoryTable({
  title,
  dimension,
  rows,
}: {
  title: string;
  dimension: string;
  rows: QssmaHistoryRow[];
}) {
  return (
    <div className="table-scroll">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{dimension}</th>
            <th scope="col">Inspeções</th>
            <th scope="col">Desvios</th>
            <th scope="col">Tratados na origem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.inspections}</td>
              <td>{row.deviations}</td>
              <td>{row.treated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
            <HistoryTable
              title="Volume mensal"
              dimension="Mês"
              rows={data.months.map((row) => ({
                ...row,
                label: `${row.label.slice(5)}/${row.label.slice(0, 4)}`,
              }))}
            />
            <HistoryTable title="Volume por tipo" dimension="Tipo de inspeção" rows={data.types} />
            <h3>Criticidade dos desvios vinculados</h3>
            <ul>
              {data.priorities.map(({ label, count }) => (
                <li key={label}>
                  {label} · {count}
                </li>
              ))}
            </ul>
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
