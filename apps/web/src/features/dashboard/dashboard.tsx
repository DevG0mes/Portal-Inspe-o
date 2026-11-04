'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  AnalyticsSummary,
  AnalyticsTrend,
  AnalyticsGroups,
  AnalyticsOccurrence,
  AnalyticsPlan,
  Paginated,
  UserRole,
  QssmaDashboard,
} from '@portal/contracts';
import { Button, Field, Input, Select, Notice, Skeleton } from '@portal/ui';
import { useResource } from '../shared/use-resource';
import { RemotePicker } from '../shared/remote-picker';
import { Pagination } from '../shared/pagination';
import { ErrorNotice } from '../shared/error-notice';
import { usePilot } from '../auth/pilot';
import { actionStates } from '../action-plans/presentation';
import { priorityLabels } from '../form-builder/model';
import { localInstant } from '../schedules/presentation';
import { ReportRequestButton } from '../reports/report-request-button';
import { QssmaCharts } from './qssma-charts';
const number = (n: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
const groupLabels: Record<keyof AnalyticsGroups, string> = {
  units: 'Por unidade',
  sectors: 'Por tipo de inspeção',
  forms: 'Por formulário',
  categories: 'Por categoria',
  priorities: 'Por prioridade',
};
function Metric({
  label,
  value,
  children,
}: {
  label: string;
  value: string | number;
  children?: ReactNode;
}) {
  return (
    <article className="card metric" aria-label={label}>
      <span>{label}</span>
      <strong>{typeof value === 'number' ? number(value) : value}</strong>
      {children && <small>{children}</small>}
    </article>
  );
}
function Panel({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error?: unknown;
  children: ReactNode;
}) {
  return loading ? <Skeleton /> : error !== undefined ? <ErrorNotice error={error} /> : children;
}
export function Dashboard({ role }: { role: UserRole }) {
  const pilot = usePilot();
  const params = useSearchParams(),
    router = useRouter(),
    [revision, setRevision] = useState(0);
  const filter = new URLSearchParams();
  for (const key of [
    'from',
    'to',
    'unitId',
    'sectorId',
    'formId',
    'category',
    'priority',
    'customerId',
    'locationId',
    'inspectorId',
  ]) {
    const value = params.get(key);
    if (value) filter.set(key, value);
  }
  const query = filter.toString(),
    ncPage = Math.max(1, Number(params.get('ncPage')) || 1),
    planPage = Math.max(1, Number(params.get('planPage')) || 1);
  const summary = useResource<AnalyticsSummary>(`analytics/summary?${query}`, revision);
  const qssma = useResource<QssmaDashboard>(`analytics/qssma?${query}`, revision);
  const trends = useResource<{ data: AnalyticsTrend[] }>(`analytics/trends?${query}`, revision);
  const ncs = useResource<Paginated<AnalyticsOccurrence> & { groups: AnalyticsGroups }>(
    `analytics/nonconformities?${query}&page=${ncPage}&pageSize=10`,
    revision,
  );
  const plans = useResource<Paginated<AnalyticsPlan>>(
    pilot ? null : `analytics/action-plans?${query}&page=${planPage}&pageSize=10`,
    revision,
  );
  function page(key: string, value: number) {
    const next = new URLSearchParams(params);
    next.set(key, String(value));
    router.replace(`/dashboard?${next}`, { scroll: false });
  }
  const data = summary.data;
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">SEGURANÇA · ACOMPANHAMENTO</span>
        <h1>Visão geral</h1>
        <p>
          {role === 'COLLABORATOR'
            ? 'Suas inspeções e correções, nos tipos de inspeção em que você tem acesso.'
            : role === 'ADMIN'
              ? 'Indicadores globais da operação e da estrutura do portal.'
              : 'Inspeções e correções nas unidades e tipos de inspeção do seu escopo.'}
        </p>
      </div>
      <div className="actions">
        {!pilot && <a href="/assignments">Inspeções atribuídas e prazos</a>}
        <a href="/inspections?state=DRAFT">Rascunhos</a>
        {!pilot && <a href="/action-plans">Planos de ação</a>}
        {!pilot && <a href="/notifications">Notificações</a>}
      </div>
      <Filters
        key={query}
        query={query}
        onApply={(next) => router.replace(`/dashboard?${next}`, { scroll: false })}
      />
      <div className="actions dashboard-toolbar">
        <Button variant="secondary" onClick={() => setRevision((r) => r + 1)}>
          Atualizar indicadores
        </Button>
        {data && (
          <ReportRequestButton
            key={query}
            label="Solicitar Excel deste recorte"
            input={{
              format: 'XLSX',
              filters: { ...Object.fromEntries(filter), from: data.from, to: data.to },
            }}
          />
        )}
        {data && (
          <span className="muted">
            Período: {data.from.split('-').reverse().join('/')} a{' '}
            {data.to.split('-').reverse().join('/')} · São Paulo
          </span>
        )}
      </div>
      <Panel loading={summary.loading} error={summary.error}>
        {data && (
          <>
            <h2>Inspeções no período</h2>
            <div className="summary-grid">
              <Metric label="Inspeções realizadas" value={qssma.data?.metrics.inspections ?? '—'} />
              <Metric label="Inspeções pendentes" value={data.inspections.pending}>
                Inclui as vencidas ainda não concluídas.
              </Metric>
              <Metric label="Inspeções vencidas" value={data.inspections.overdue} />
              <Metric label="Rascunhos" value={data.inspections.drafts} />
              <Metric label="Não conformidades" value={qssma.data?.metrics.deviations ?? '—'} />
              <Metric
                label="Índice de conformidade"
                value={
                  data.inspections.conformityRate === null
                    ? 'Sem base'
                    : `${number(data.inspections.conformityRate)}%`
                }
              >
                {number(data.inspections.evaluatedAnswers)} respostas avaliáveis ·{' '}
                {number(data.inspections.nonconformingAnswers)} com não conformidade.
              </Metric>
            </div>
            <h2>Ações corretivas</h2>
            <div className="summary-grid">
              <Metric label="Planos abertos" value={data.plans.open} />
              <Metric label="Em andamento" value={data.plans.inProgress} />
              <Metric label="Aguardando validação" value={data.plans.awaitingValidation} />
              <Metric label="Planos concluídos" value={data.plans.completed} />
              <Metric label="Correções vencidas" value={data.plans.overdue} />
              <Metric label="Correções críticas pendentes" value={data.plans.critical} />
              <Metric
                label="Tempo médio de resolução"
                value={
                  data.plans.averageResolutionHours === null
                    ? 'Sem base'
                    : `${number(data.plans.averageResolutionHours)} h`
                }
              >
                Da criação à aprovação dos planos concluídos deste recorte.
              </Metric>
            </div>
            {data.administration && (
              <section className="card">
                <h2>Administração global</h2>
                <p className="muted">
                  Situação atual da estrutura, independente dos filtros do período.
                </p>
                <dl className="analytics-admin">
                  {Object.entries({
                    'Usuários ativos': data.administration.activeUsers,
                    'Unidades ativas': data.administration.units,
                    'Tipos de inspeção ativos': data.administration.sectors,
                    'Formulários publicados': data.administration.publishedForms,
                    'Formulários em rascunho': data.administration.draftForms,
                    'Formulários arquivados': data.administration.archivedForms,
                  }).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{number(value)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="actions">
                  <a href="/users">Usuários</a>
                  <a href="/units">Unidades</a>
                  <a href="/admin/forms">Formulários</a>
                </div>
              </section>
            )}
          </>
        )}
      </Panel>
      <Panel loading={qssma.loading} error={qssma.error}>
        {qssma.data && (
          <>
            <h2>Indicadores QSSMA</h2>
            {role === 'ADMIN' && (
              <p>
                Os volumes incluem o histórico importado. A conformidade usa as inspeções avaliáveis
                do portal.
              </p>
            )}
            <div className="summary-grid">
              <Metric
                label="Desvios no escopo completo"
                value={qssma.data.metrics.scopeDeviationTotal}
              >
                Todos os períodos, dentro do seu acesso. Este cartão ignora os filtros do recorte.
              </Metric>
              <Metric
                label="Inspeções 100% conformes"
                value={qssma.data.metrics.conformingInspections}
              />
              <Metric
                label="Inspeções com desvios"
                value={qssma.data.metrics.nonconformingInspections}
              />
              <Metric label="Desvios tratados" value={qssma.data.metrics.treated}>
                Inclui desvios tratados na origem e planos aprovados no portal.
              </Metric>
              <Metric label="Desvios pendentes" value={qssma.data.metrics.pending}>
                Inclui ocorrências sem plano e aguardando validação.
              </Metric>
              <Metric
                label="Desvios de criticidade alta"
                value={qssma.data.priorities.find((p) => p.label === 'HIGH')?.count ?? 0}
              />
              <Metric
                label="Desvios críticos"
                value={qssma.data.priorities.find((p) => p.label === 'CRITICAL')?.count ?? 0}
              />
              <Metric
                label="Conformidade por colaborador/dia"
                value={
                  qssma.data.metrics.dayConformityRate === null
                    ? 'Sem base'
                    : `${number(qssma.data.metrics.dayConformityRate)}%`
                }
              >
                Meta {qssma.data.targets.conformityRate}% · {qssma.data.metrics.authorDays}{' '}
                combinações de colaborador e data.
              </Metric>
              <Metric
                label="Colaborador/dia sem desvio"
                value={qssma.data.metrics.authorDaysWithoutDeviation}
              />
              <Metric
                label="Colaborador/dia com desvio"
                value={qssma.data.metrics.authorDaysWithDeviation}
              />
              <Metric
                label="Média de desvios por inspeção"
                value={qssma.data.metrics.averageDeviations ?? 'Sem base'}
              />
              <Metric
                label="Percentual de desvios tratados"
                value={
                  qssma.data.metrics.treatmentRate === null
                    ? 'Sem base'
                    : `${number(qssma.data.metrics.treatmentRate)}%`
                }
              />
            </div>
            <QssmaCharts data={qssma.data} />
          </>
        )}
      </Panel>
      <details className="card">
        <summary>Como ler os indicadores</summary>
        <p>
          Resultados usam a última conclusão de cada inspeção, inclusive se reaberta. Respostas sem
          regra de não conformidade, vazias e “Não se aplica” não entram no índice. Sem respostas
          avaliáveis, o índice fica sem base.
        </p>
        <p>
          No modelo QSSMA, “dias com/sem desvio” são combinações de colaborador e data de conclusão,
          não dias consecutivos. Uma mesma pessoa com várias inspeções na data conta uma vez;
          qualquer desvio torna essa combinação não conforme. O índice por respostas acima usa outra
          base. Desvios tratados exigem plano aprovado/concluído; a ação textual não encerra o
          desvio.
        </p>
        <p>
          A meta de volume é 12 inspeções por mês e a de conformidade por colaborador/dia é 95%,
          conforme o PBIX. A linha mensal não é proporcional a períodos parciais nem multiplicada
          pelos filtros. Tratamentos são agrupados pelo mês da inspeção de origem e refletem a
          situação atual dos planos. Criticidade Crítica permanece separada de Alta.
        </p>
        <p>
          O período considera conclusão para resultados, criação para rascunhos e planos, e
          ocorrência para atribuições. Pendências são a situação atual. Categoria e prioridade
          recortam perguntas avaliáveis e planos; atribuições e rascunhos ficam zerados nesse
          recorte. Formulários arquivados conservam seus resultados.
        </p>
      </details>
      <section className="card list-card">
        <h2>Evolução das inspeções</h2>
        <Panel loading={trends.loading} error={trends.error}>
          {trends.data &&
            (trends.data.data.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <caption>Evolução por dia de conclusão</caption>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Realizadas</th>
                      <th>Não conformidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.data.data.map((row) => (
                      <tr key={row.date}>
                        <td data-label="Data">{row.date.split('-').reverse().join('/')}</td>
                        <td data-label="Realizadas">
                          {number(row.completed)}
                          <meter
                            className="analytics-meter"
                            aria-label={`Inspeções realizadas em ${row.date}`}
                            min={0}
                            max={Math.max(1, ...trends.data!.data.map((x) => x.completed))}
                            value={row.completed}
                          />
                        </td>
                        <td data-label="Não conformidades">{number(row.nonconformities)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Notice>Nenhuma inspeção concluída neste recorte.</Notice>
            ))}
        </Panel>
      </section>
      <Panel loading={ncs.loading} error={ncs.error}>
        {ncs.data && (
          <>
            <section className="card">
              <h2>Distribuição das não conformidades</h2>
              <p className="muted">
                Até 10 grupos com maior quantidade em cada dimensão. A lista detalhada abaixo inclui
                todo o recorte.
              </p>
              <div className="analytics-groups">
                {Object.entries(ncs.data.groups).map(([key, rows]) => (
                  <div key={key}>
                    <h3>{groupLabels[key as keyof AnalyticsGroups]}</h3>
                    {rows.length ? (
                      <table>
                        <caption className="sr-only">
                          {groupLabels[key as keyof AnalyticsGroups]}
                        </caption>
                        <thead>
                          <tr>
                            <th>Grupo</th>
                            <th>Quantidade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row: { label: string; count: number }, index: number) => (
                            <tr key={`${row.label}-${index}`}>
                              <td data-label="Grupo">
                                {key === 'priorities'
                                  ? priorityLabels[row.label as keyof typeof priorityLabels]
                                  : row.label}
                              </td>
                              <td data-label="Quantidade">{number(row.count)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p>Sem ocorrências.</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
            <section className="card list-card">
              <h2>Não conformidades</h2>
              {ncs.data.data.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <caption>Não conformidades do período</caption>
                    <thead>
                      <tr>
                        <th>Pergunta / formulário</th>
                        <th>Protocolo / situação</th>
                        <th>Local</th>
                        <th>Categoria / prioridade</th>
                        <th>Conclusão</th>
                        <th>Ação realizada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ncs.data.data.map((row) => (
                        <tr key={`${row.submissionId}-${row.questionId}`}>
                          <td data-label="Pergunta / formulário">
                            <a href={`/inspections/${row.inspectionId}`}>{row.questionLabel}</a>
                            <span className="cell-detail">{row.formTitle}</span>
                          </td>
                          <td data-label="Protocolo / situação">
                            <span>{row.inspectionId}</span>
                            <span className="cell-detail">{row.treatmentStatus ?? 'Pendente'}</span>
                          </td>
                          <td data-label="Local">
                            {row.locationName ?? 'Sem local identificado'}
                            <span className="cell-detail">
                              {row.customerName ?? 'Sem cliente identificado'}
                            </span>
                            <span className="cell-detail">
                              {row.unitName} · {row.sectorName}
                            </span>
                          </td>
                          <td data-label="Categoria / prioridade">
                            {row.category} ·{' '}
                            {priorityLabels[row.priority as keyof typeof priorityLabels]}
                          </td>
                          <td data-label="Conclusão">{localInstant(row.completedAt)}</td>
                          <td data-label="Ação realizada">
                            {row.actionText || 'Sem ação textual vinculada'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Notice>Nenhuma não conformidade neste recorte.</Notice>
              )}
              <Pagination
                page={ncPage}
                pageSize={10}
                total={ncs.data.total}
                onPage={(p) => page('ncPage', p)}
              />
            </section>
          </>
        )}
      </Panel>
      {!pilot && (
        <section className="card list-card">
          <h2>Planos de ação do período</h2>
          <Panel loading={plans.loading} error={plans.error}>
            {plans.data && (
              <>
                {plans.data.data.length ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <caption>Planos criados no período</caption>
                      <thead>
                        <tr>
                          <th>Correção</th>
                          <th>Local</th>
                          <th>Situação</th>
                          <th>Prazo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plans.data.data.map((row) => (
                          <tr key={row.id}>
                            <td data-label="Correção">
                              <a href={`/action-plans/${row.id}`}>{row.description}</a>
                            </td>
                            <td data-label="Local">
                              {row.unitName} · {row.sectorName}
                            </td>
                            <td data-label="Situação">
                              {actionStates[row.state]}
                              {row.overdue && <span className="cell-detail">Vencido</span>}
                            </td>
                            <td data-label="Prazo">{localInstant(row.dueAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Notice>Nenhum plano criado neste recorte.</Notice>
                )}
                <Pagination
                  page={planPage}
                  pageSize={10}
                  total={plans.data.total}
                  onPage={(p) => page('planPage', p)}
                />
              </>
            )}
          </Panel>
        </section>
      )}
    </>
  );
}
function Filters({ query, onApply }: { query: string; onApply: (q: string) => void }) {
  const params = new URLSearchParams(query),
    [from, setFrom] = useState(params.get('from') ?? ''),
    [to, setTo] = useState(params.get('to') ?? ''),
    [unit, setUnit] = useState(params.get('unitId') ?? ''),
    [sector, setSector] = useState(params.get('sectorId') ?? ''),
    [form, setForm] = useState(params.get('formId') ?? ''),
    [customer, setCustomer] = useState(params.get('customerId') ?? ''),
    [location, setLocation] = useState(params.get('locationId') ?? ''),
    [inspector, setInspector] = useState(params.get('inspectorId') ?? ''),
    [category, setCategory] = useState(params.get('category') ?? ''),
    [priority, setPriority] = useState(params.get('priority') ?? ''),
    [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (from && to && from > to) {
      setError('A data inicial deve ser anterior ou igual à final.');
      document.getElementById('analytics-from')?.focus();
      return;
    }
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({
      from,
      to,
      unitId: unit,
      sectorId: sector,
      formId: form,
      customerId: customer,
      locationId: location,
      inspectorId: inspector,
      category: category.trim(),
      priority,
    }))
      if (value) next.set(key, value);
    onApply(next.toString());
  }
  return (
    <form className="card dashboard-filters" onSubmit={submit} noValidate>
      <h2>Recorte dos indicadores</h2>
      <p className="muted">
        Sem datas, serão usados os últimos 30 dias. Janela máxima de 366 dias. A estrutura deve
        estar ativa; formulários usados podem estar arquivados.
      </p>
      <div className="dashboard-filter-grid">
        <Field id="analytics-from" label="Data inicial">
          <Input
            id="analytics-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field id="analytics-to" label="Data final">
          <Input id="analytics-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field id="analytics-category" label="Categoria">
          <Input
            id="analytics-category"
            maxLength={160}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </Field>
        <Field id="analytics-priority" label="Prioridade">
          <Select
            id="analytics-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">Todas</option>
            {Object.entries(priorityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <details className="dashboard-filter-details">
        <summary>Filtrar unidade, tipo de inspeção e formulário</summary>
        <div className="dashboard-filter-grid">
          <RemotePicker
            id="analytics-unit"
            label="Unidade"
            endpoint="organization/units"
            value={unit}
            onChange={(value) => {
              setUnit(value);
              setSector('');
              setCustomer('');
              setLocation('');
              setInspector('');
            }}
          />
          <RemotePicker
            key={unit}
            id="analytics-sector"
            label="Tipo de inspeção"
            endpoint={`organization/sectors${unit ? `?unitId=${unit}` : ''}`}
            value={sector}
            onChange={setSector}
          />
          <RemotePicker
            id="analytics-form"
            label="Formulário"
            endpoint="analytics/forms"
            activeOnly={false}
            value={form}
            onChange={setForm}
          />
        </div>
      </details>
      <details className="dashboard-filter-details">
        <summary>Filtrar cliente, local e colaborador</summary>
        <div className="dashboard-filter-grid">
          <RemotePicker
            id="analytics-customer"
            label="Cliente"
            endpoint={`analytics/filter-options?dimension=customers${unit ? `&unitId=${unit}` : ''}`}
            activeOnly={false}
            value={customer}
            onChange={(value) => {
              setCustomer(value);
              setLocation('');
            }}
          />
          <RemotePicker
            key={`${unit}-${customer}`}
            id="analytics-location"
            label="Local"
            endpoint={`analytics/filter-options?dimension=locations${unit ? `&unitId=${unit}` : ''}${customer ? `&customerId=${customer}` : ''}`}
            activeOnly={false}
            value={location}
            onChange={setLocation}
          />
          <RemotePicker
            id="analytics-inspector"
            label="Colaborador"
            endpoint={`analytics/filter-options?dimension=inspectors${unit ? `&unitId=${unit}` : ''}`}
            activeOnly={false}
            value={inspector}
            onChange={setInspector}
          />
        </div>
      </details>
      {error && <Notice error>{error}</Notice>}
      <div className="actions">
        <Button type="submit">Aplicar filtros</Button>
        <a className="button secondary" href="/dashboard">
          Limpar filtros
        </a>
      </div>
    </form>
  );
}
