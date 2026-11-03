import ExcelJS from 'exceljs';
import type { AnalyticsReportSnapshot } from '@portal/contracts';
import { excelInstant, instant, priorities, states } from './presentation.js';
type Cell = string | number | Date | null;
export async function renderXlsx(snapshot: AnalyticsReportSnapshot): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = 'Portal de Segurança';
  book.created = new Date(snapshot.requestedAt);
  book.modified = new Date(snapshot.requestedAt);
  function sheet(name: string, headers: string[], rows: Cell[][], widths: number[]) {
    const s = book.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });
    s.addRow(headers);
    for (const row of rows) s.addRow(row);
    s.columns.forEach((c, index) => {
      c.width = widths[index] ?? 24;
    });
    s.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    style(s, 1);
    return s;
  }
  function style(s: ExcelJS.Worksheet, header: number) {
    s.eachRow((row, index) => {
      row.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF15354B' } };
        cell.alignment = { vertical: 'top', wrapText: true };
        if (cell.value instanceof Date) cell.numFmt = 'dd/mm/yyyy hh:mm';
        else if (typeof cell.value === 'number')
          cell.numFmt = Number.isInteger(cell.value) ? '#,##0' : '#,##0.00';
      });
      if (index >= header)
        row.height = Math.min(
          409,
          Math.max(
            24,
            ...(row.values instanceof Array
              ? Array.from(row.values, (v, i) =>
                  typeof v === 'string'
                    ? 14 * Math.ceil(v.length / (s.getColumn(Math.max(1, i)).width ?? 24)) + 10
                    : 24,
                )
              : [24]),
          ),
        );
    });
    const h = s.getRow(header);
    h.height = 30;
    h.eachCell((c) => {
      c.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10354B' } };
    });
  }
  const a = snapshot.summary.inspections,
    p = snapshot.summary.plans;
  const summary = book.addWorksheet('Resumo', { views: [{ state: 'frozen', ySplit: 5 }] });
  summary.columns = [{ width: 54 }, { width: 28 }];
  summary.addRows([
    ['Portal de Segurança — Indicadores'],
    ['Gerado em São Paulo', instant(snapshot.requestedAt)],
    ['Período', `${snapshot.summary.from} a ${snapshot.summary.to}`],
    [],
    ['Indicador', 'Valor'],
    ['Inspeções realizadas', a.completed],
    ['Rascunhos', a.drafts],
    ['Inspeções pendentes (inclui vencidas)', a.pending],
    ['Inspeções vencidas', a.overdue],
    ['Respostas avaliáveis', a.evaluatedAnswers],
    ['Respostas avaliáveis com ocorrência', a.nonconformingAnswers],
    ['Índice de conformidade', a.conformityRate === null ? null : a.conformityRate / 100],
    ['Não conformidades no recorte', a.nonconformities],
    ['Planos abertos', p.open],
    ['Planos em andamento', p.inProgress],
    ['Aguardando validação', p.awaitingValidation],
    ['Planos concluídos', p.completed],
    ['Correções vencidas', p.overdue],
    ['Correções críticas pendentes', p.critical],
    ['Tempo médio de resolução (horas)', p.averageResolutionHours],
    ['Sem base', 'Célula vazia indica ausência de denominador ou de planos concluídos.'],
    [
      'Método',
      'Última conclusão por inspeção. NA de YES_NO_NA excluído do índice, preservado nas ocorrências. Planos e rascunhos por criação; resultados por conclusão; atribuições por ocorrência.',
    ],
    ['Solicitante', snapshot.requestedBy],
  ]);
  style(summary, 5);
  summary.getCell('A1').font = { name: 'Arial', bold: true, size: 16, color: { argb: 'FF10354B' } };
  summary.getCell('B12').numFmt = '0.00%';
  summary.autoFilter = 'A5:B20';
  sheet(
    'Evolução',
    ['Data (São Paulo)', 'Inspeções realizadas', 'Não conformidades'],
    snapshot.trends.map((r) => [new Date(`${r.date}T00:00:00Z`), r.completed, r.nonconformities]),
    [24, 26, 26],
  ).getColumn(1).numFmt = 'dd/mm/yyyy';
  sheet(
    'Ocorrências',
    [
      'Pergunta',
      'Formulário',
      'Unidade',
      'Tipo de inspeção',
      'Categoria',
      'Prioridade',
      'Conclusão (São Paulo)',
      'Inspeção',
      'Conclusão — identificador',
      'Cliente',
      'Local',
      'Situação do desvio',
      'Ação realizada',
    ],
    snapshot.occurrences.map((r) => [
      r.questionLabel,
      r.formTitle,
      r.unitName,
      r.sectorName,
      r.category,
      priorities[r.priority] ?? r.priority,
      excelInstant(r.completedAt),
      r.inspectionId,
      r.submissionId,
      r.customerName ?? null,
      r.locationName ?? null,
      r.treatmentStatus ?? null,
      r.actionText ?? null,
    ]),
    [60, 40, 32, 32, 30, 18, 26, 40, 40, 32, 32, 24, 70],
  );
  sheet(
    'Planos',
    [
      'Correção',
      'Unidade',
      'Tipo de inspeção',
      'Situação',
      'Prioridade',
      'Prazo (São Paulo)',
      'Vencido',
      'Plano — identificador',
    ],
    snapshot.plans.map((r) => [
      r.description,
      r.unitName,
      r.sectorName,
      states[r.state],
      priorities[r.priority] ?? r.priority,
      excelInstant(r.dueAt),
      r.overdue ? 'Sim' : 'Não',
      r.id,
    ]),
    [70, 32, 32, 28, 18, 26, 16, 40],
  );
  const labels: Record<string, string> = {
    from: 'Data inicial',
    to: 'Data final',
    unitId: 'Unidade — identificador',
    sectorId: 'Tipo de inspeção — identificador',
    formId: 'Formulário — identificador',
    category: 'Categoria',
    priority: 'Prioridade',
    customerId: 'Cliente — identificador',
    locationId: 'Local — identificador',
    inspectorId: 'Colaborador — identificador',
  };
  sheet(
    'Filtros',
    ['Campo', 'Valor'],
    [
      ...Object.entries(snapshot.filters).map(([key, value]): Cell[] => [
        labels[key] ?? key,
        String(value),
      ]),
      ['Fuso horário', 'America/Sao_Paulo'],
      ['Gerado em', instant(snapshot.requestedAt)],
      ['Solicitante', snapshot.requestedBy],
      [
        'Escopo',
        'Somente registros autorizados no momento da solicitação. Download revalida acesso atual.',
      ],
      [
        'Texto longo',
        'Conteúdo integral permanece na célula; use a barra de fórmulas para campos extensos.',
      ],
    ],
    [40, 85],
  );
  return Buffer.from(await book.xlsx.writeBuffer());
}
