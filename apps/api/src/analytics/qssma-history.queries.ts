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
    const [totals] = await tx.execute<QssmaHistory['totals'][]>(`select ${counts} ${from}`);
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
    return { totals: totals!, months, types, priorities };
  });
}
