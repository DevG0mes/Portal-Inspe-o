import type { EntityManager } from '@mikro-orm/postgresql';
import type { QssmaHistory, QssmaHistoryRow } from '@portal/contracts';

export async function qssmaHistory(em: EntityManager): Promise<QssmaHistory> {
  return em.transactional(async (tx) => {
    await tx.execute('set transaction isolation level repeatable read, read only');
    const from = `from qssma_historical_inspection i
      left join qssma_historical_deviation d on d.protocol = i.protocol`;
    const counts = `count(distinct i.protocol)::int as inspections,
      count(d.source_id)::int as deviations,
      (count(*) filter (where d.source_status = 'Tratado'))::int as treated`;
    const [summary] = await tx.execute<
      (QssmaHistory['totals'] & { inspectionsWithDeviation: number })[]
    >(`select ${counts}, count(distinct d.protocol)::int as "inspectionsWithDeviation" ${from}`);
    const { inspectionsWithDeviation, ...totals } = summary!;
    const months = await tx.execute<QssmaHistoryRow[]>(
      `select to_char(i.inspection_date, 'YYYY-MM') as label, ${counts}
        ${from} group by 1 order by 1`,
    );
    const types = await tx.execute<QssmaHistoryRow[]>(
      `select i.form_type as label, ${counts} ${from} group by 1 order by inspections desc, label`,
    );
    const priorities = await tx.execute<QssmaHistory['priorities']>(
      'select priority as label, count(*)::int as count from qssma_historical_deviation group by 1 order by 1',
    );
    const statuses = await tx.execute<QssmaHistory['statuses']>(
      'select source_status as label, count(*)::int as count from qssma_historical_deviation group by 1 order by count desc, label',
    );
    const locations = await tx.execute<QssmaHistory['locations']>(
      `select coalesce(location, 'Sem local') as label, count(*)::int as count
        from qssma_historical_inspection group by 1 order by count desc, label limit 10`,
    );
    const inspectors = await tx.execute<QssmaHistory['inspectors']>(
      `select coalesce(inspector, 'Sem responsável') as label, count(*)::int as count
        from qssma_historical_inspection group by 1 order by count desc, label limit 10`,
    );
    const categories = await tx.execute<QssmaHistory['categories']>(
      `select coalesce(category, 'Sem categoria') as label, count(*)::int as count
        from qssma_historical_deviation group by 1 order by count desc, label limit 10`,
    );
    return {
      totals,
      inspectionsWithDeviation,
      months,
      types,
      priorities,
      statuses,
      locations,
      inspectors,
      categories,
    };
  });
}
