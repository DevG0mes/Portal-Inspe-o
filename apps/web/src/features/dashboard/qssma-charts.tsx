'use client';
import { useId } from 'react';
import type { QssmaDashboard } from '@portal/contracts';
const fmt = (value: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
type Count = { label: string; count: number };
type Series = { label: string; values: number[]; tone: string };

/** Charts have native tooltips and a keyboard-accessible equivalent data table. */
function Columns({
  title,
  months,
  series,
  target,
}: {
  title: string;
  months: string[];
  series: Series[];
  target?: number;
}) {
  const id = useId();
  const max = Math.max(1, target ?? 0, ...series.flatMap((s) => s.values));
  const ticks = [...new Set([0, Math.ceil(max / 2), max])];
  const width = 720,
    height = 250,
    top = 20,
    bottom = 205,
    left = 78;
  const y = (v: number) => bottom - ((bottom - top) * v) / max;
  const step = (width - left - 18) / Math.max(1, months.length);
  const barWidth = Math.min(44, (step * 0.72) / series.length);
  return (
    <figure className="card qssma-chart">
      <figcaption id={id}>
        <h3>{title}</h3>
      </figcaption>
      <ul className="chart-legend">
        {series.map((s) => (
          <li key={s.label}>
            <i className={`chart-swatch ${s.tone}`} aria-hidden="true" />
            {s.label}
          </li>
        ))}
        {target !== undefined && <li>Meta: {fmt(target)} / mês</li>}
      </ul>
      <div
        className={`chart-plot${months.length <= 4 ? ' compact' : ''}`}
        tabIndex={0}
        role="region"
        aria-label={`Área do gráfico: ${title}`}
      >
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="chart-gridline"
                x1={left}
                x2={width - 12}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text className="chart-axis" x={left - 8} y={y(tick) + 4} textAnchor="end">
                {fmt(tick)}
              </text>
            </g>
          ))}
          {target !== undefined && (
            <line
              className="chart-target"
              x1={left}
              x2={width - 12}
              y1={y(target)}
              y2={y(target)}
            />
          )}
          {months.map((m, i) => (
            <g key={m}>
              {series.map((s, j) => (
                <rect
                  key={s.label}
                  className={`chart-fill ${s.tone}`}
                  x={left + step * (i + 0.5) + (j - series.length / 2) * barWidth}
                  y={y(s.values[i] ?? 0)}
                  width={Math.max(1, barWidth - 2)}
                  height={bottom - y(s.values[i] ?? 0)}
                  rx={2}
                >
                  <title>
                    {monthLabel(m)} · {s.label}: {fmt(s.values[i] ?? 0)}
                  </title>
                </rect>
              ))}
              <text
                className="chart-axis"
                x={left + step * (i + 0.5)}
                y={bottom + 23}
                textAnchor="middle"
                transform={
                  months.length > 6
                    ? `rotate(-30 ${left + step * (i + 0.5)} ${bottom + 23})`
                    : undefined
                }
              >
                {monthLabel(m)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {months.length > 4 && (
        <p className="muted">
          Deslize o gráfico ou use as setas do teclado para consultar todos os meses.
        </p>
      )}
      <details>
        <summary>Ver dados de {title.toLowerCase()}</summary>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label={`Dados de ${title.toLowerCase()}`}
        >
          <table>
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Mês</th>
                {series.map((s) => (
                  <th key={s.label} scope="col">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={m}>
                  <th scope="row">{monthLabel(m)}</th>
                  {series.map((s) => (
                    <td key={s.label} data-label={s.label}>
                      {fmt(s.values[i] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function Bars({ title, rows }: { title: string; rows: Count[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="card qssma-chart">
      <h3>{title}</h3>
      <p className="muted">Até 10 maiores grupos no recorte.</p>
      {rows.length ? (
        <ol className="chart-bars">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`}>
              <div>
                <span>{r.label}</span>
                <strong>{fmt(r.count)}</strong>
              </div>
              <meter aria-label={`${r.label}: ${r.count}`} min={0} max={max} value={r.count} />
            </li>
          ))}
        </ol>
      ) : (
        <p>Sem registros neste recorte.</p>
      )}
    </section>
  );
}

function Donut({ title, rows, tones }: { title: string; rows: Count[]; tones: string[] }) {
  const id = useId(),
    total = rows.reduce((sum, r) => sum + r.count, 0);
  let offset = 0;
  return (
    <figure className="card qssma-chart">
      <figcaption id={id}>
        <h3>{title}</h3>
      </figcaption>
      <div className="chart-donut-layout">
        <svg viewBox="0 0 160 160" role="img" aria-labelledby={id}>
          <circle cx={80} cy={80} r={58} className="chart-ring-base" />
          {rows.map((r, i) => {
            const length = total ? (r.count / total) * 100 : 0;
            const start = offset;
            offset += length;
            return (
              <circle
                key={r.label}
                cx={80}
                cy={80}
                r={58}
                pathLength={100}
                className={`chart-ring ${tones[i % tones.length]}`}
                strokeDasharray={`${length} ${100 - length}`}
                strokeDashoffset={-start}
                transform="rotate(-90 80 80)"
              >
                <title>
                  {r.label}: {fmt(r.count)}
                </title>
              </circle>
            );
          })}
          <text x={80} y={80} className="chart-total" textAnchor="middle">
            {fmt(total)}
          </text>
          <text x={80} y={101} className="chart-axis" textAnchor="middle">
            desvios
          </text>
        </svg>
        <ul className="chart-legend chart-legend-vertical">
          {rows.map((r, i) => (
            <li key={r.label}>
              <i className={`chart-swatch ${tones[i % tones.length]}`} aria-hidden="true" />
              <span>
                {r.label}: <strong>{fmt(r.count)}</strong>
                {total > 0 ? ` (${fmt((r.count / total) * 100)}%)` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {!total && <p>Sem desvios neste recorte.</p>}
    </figure>
  );
}

export function QssmaCharts({ data }: { data: QssmaDashboard }) {
  const months = data.months.map((m) => m.month);
  const priorityLabels: Record<string, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
  };
  const priorityRows = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((key) => ({
    label: priorityLabels[key]!,
    count: data.priorities.find((p) => p.label === key)?.count ?? 0,
  }));
  return (
    <div className="qssma-chart-grid">
      <Columns
        title="Evolução mensal de inspeções"
        months={months}
        series={[
          { label: 'Inspeções', values: data.months.map((m) => m.inspections), tone: 'tone-brand' },
        ]}
        target={data.targets.monthlyInspections}
      />
      <Columns
        title="Evolução mensal de desvios"
        months={months}
        series={[
          { label: 'Desvios', values: data.months.map((m) => m.deviations), tone: 'tone-danger' },
        ]}
      />
      <Columns
        title="Evolução dos desvios tratados"
        months={months}
        series={[
          { label: 'Desvios', values: data.months.map((m) => m.deviations), tone: 'tone-brand' },
          { label: 'Tratados', values: data.months.map((m) => m.treated), tone: 'tone-success' },
        ]}
      />
      <Donut
        title="Situação dos desvios"
        rows={data.statuses}
        tones={['tone-success', 'tone-brand', 'tone-notice', 'tone-muted']}
      />
      <Donut
        title="Distribuição por criticidade"
        rows={priorityRows}
        tones={['tone-success', 'tone-notice', 'tone-brand', 'tone-danger']}
      />
      <Bars title="Inspeções por tipo" rows={data.rankings.types} />
      <Bars title="Inspeções por local" rows={data.rankings.locations} />
      <Bars title="Inspeções por colaborador" rows={data.rankings.inspectors} />
      <Bars title="Desvios por categoria" rows={data.rankings.categories} />
    </div>
  );
}
