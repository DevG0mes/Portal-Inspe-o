import { readFile } from 'node:fs/promises';
import { MikroORM } from '@mikro-orm/postgresql';
import { loadApiEnvironment } from '@portal/config';
import { z } from 'zod';
import { createDatabaseOptions } from '../database/mikro-orm.config.js';

const required = z.string().trim().min(1);
const optional = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null);
const batchSchema = z.object({
  source: z.literal('Power BI QSSMA'),
  inspections: z
    .array(
      z.object({
        protocol: required,
        date: z.iso.date(),
        unit: required,
        formType: required,
        inspector: optional,
        customer: optional,
        location: optional,
      }),
    )
    .min(1),
  deviations: z.array(
    z.object({
      id: required,
      protocol: required,
      formType: required,
      question: required,
      answer: optional,
      action: optional,
      sourceStatus: required,
      priority: required,
      category: optional,
    }),
  ),
  unresolved: z.array(z.unknown()),
});

async function run() {
  const [path, mode, ...extra] = process.argv.slice(2);
  if (!path || (mode && mode !== '--apply') || extra.length) {
    throw new Error('Informe o caminho do lote JSON e, para gravar, use --apply.');
  }
  const content = await readFile(path, 'utf8');
  const batch = batchSchema.parse(JSON.parse(content.replace(/^\uFEFF/, '')));
  const inspections = new Map(batch.inspections.map((row) => [row.protocol, row]));
  const ids = new Set(batch.deviations.map((row) => row.id));
  if (inspections.size !== batch.inspections.length || ids.size !== batch.deviations.length) {
    throw new Error('O lote contém identificadores duplicados.');
  }
  for (const row of batch.deviations) {
    const inspection = inspections.get(row.protocol);
    if (inspection?.formType.replaceAll('-', '_') !== row.formType) {
      throw new Error('O lote contém desvios sem inspeção ou com tipo divergente.');
    }
  }
  console.info(
    `Lote validado: ${inspections.size} inspeções, ${ids.size} desvios e ${batch.unresolved.length} pendências excluídas.`,
  );
  if (mode !== '--apply') return;

  const environment = loadApiEnvironment(process.env);
  const database = await MikroORM.init(createDatabaseOptions(environment.DATABASE_URL));
  try {
    await database.em.fork().transactional(async (tx) => {
      for (const row of batch.inspections) {
        await tx.execute(
          `insert into qssma_historical_inspection
            (protocol, inspection_date, unit, form_type, inspector, customer, location)
            values (?, ?, ?, ?, ?, ?, ?)
            on conflict (protocol) do update set
              inspection_date = excluded.inspection_date, unit = excluded.unit,
              form_type = excluded.form_type, inspector = excluded.inspector,
              customer = excluded.customer, location = excluded.location`,
          [
            row.protocol,
            row.date,
            row.unit,
            row.formType,
            row.inspector,
            row.customer,
            row.location,
          ],
        );
      }
      for (const row of batch.deviations) {
        await tx.execute(
          `insert into qssma_historical_deviation
            (source_id, protocol, question, answer, action, source_status, priority, category)
            values (?, ?, ?, ?, ?, ?, ?, ?)
            on conflict (source_id) do update set
              protocol = excluded.protocol, question = excluded.question,
              answer = excluded.answer, action = excluded.action, source_status = excluded.source_status,
              priority = excluded.priority, category = excluded.category`,
          [
            row.id,
            row.protocol,
            row.question,
            row.answer,
            row.action,
            row.sourceStatus,
            row.priority,
            row.category,
          ],
        );
      }
    });
    console.info('Histórico gravado.');
  } finally {
    await database.close(true);
  }
}

run().catch((error: unknown) => {
  if (error instanceof z.ZodError) {
    console.error(
      'Lote inválido:',
      error.issues.map(({ path, code }) => [path.join('.'), code]),
    );
  } else {
    console.error(
      'Falha ao processar o lote. Confira o caminho, as chaves e a configuração do banco.',
    );
  }
  process.exitCode = 1;
});
