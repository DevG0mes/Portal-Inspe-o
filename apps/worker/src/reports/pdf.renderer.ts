import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { imageSize } from 'image-size';
import type { InspectionReportSnapshot, EvidenceFile } from '@portal/contracts';
import { answer, dateOnly, instant, priorities, states } from './presentation.js';
const fontPath = (name: string) => fileURLToPath(new URL(`../../assets/${name}`, import.meta.url));
const eventLabels: Record<string, string> = {
  CREATED: 'Plano criado',
  ASSIGN: 'Atribuição alterada',
  START: 'Execução iniciada',
  COMMENT: 'Comentário',
  REQUEST_VALIDATION: 'Validação solicitada',
  APPROVE: 'Correção aprovada',
  RETURN: 'Correção devolvida',
};
export async function renderPdf(
  s: InspectionReportSnapshot,
  read: (key: string, max: number) => Promise<Buffer>,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, bottom: 54, left: 48, right: 48 },
    bufferPages: true,
    info: {
      Title: 'Relatório de inspeção de segurança',
      Author: 'Portal de Segurança',
      CreationDate: new Date(s.requestedAt),
    },
  });
  doc.registerFont('Regular', fontPath('NotoSans-Regular.ttf'));
  doc.registerFont('Bold', fontPath('NotoSans-Bold.ttf'));
  doc.font('Regular');
  doc.registerFont('Math', fontPath('NotoSansMath-Regular.ttf'));
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const clean = (v: string) =>
    v.normalize('NFC').replace(/\p{Cc}/gu, (c) => (['\n', '\r', '\t'].includes(c) ? c : ''));
  function write(v: string, font: string, size: number, color: string) {
    const parts = clean(v)
      .split(/([\u2200-\u22ff\u27c0-\u27ef\u2980-\u2aff]+)/u)
      .filter(Boolean);
    parts.forEach((part, index) =>
      doc
        .font(/[\u2200-\u22ff\u27c0-\u27ef\u2980-\u2aff]/u.test(part) ? 'Math' : font)
        .fontSize(size)
        .fillColor(color)
        .text(part, { lineGap: 3, continued: index < parts.length - 1 }),
    );
  }
  function text(v: string) {
    write(v, 'Regular', 10, '#17354b');
    doc.moveDown(0.4);
  }
  function heading(v: string) {
    if (doc.y > doc.page.height - 130) doc.addPage();
    write(v, 'Bold', 13, '#10354b');
    doc.moveDown(0.5);
  }
  let previews = 0,
    readBytes = 0;
  async function evidence(file: EvidenceFile) {
    text(`Evidência: ${file.filename} | ${file.mime} | ${file.size} bytes`);
    if (file.sha256) text(`SHA-256: ${file.sha256}`);
    const asset = s.assets.find((a) => a.id === file.id);
    if (!asset) {
      text('Evidência indisponível no armazenamento.');
      return;
    }
    if (!['image/png', 'image/jpeg'].includes(file.mime)) {
      text('Sem prévia neste PDF. Consulte o arquivo original no portal.');
      return;
    }
    if (previews >= 5 || readBytes >= 20 * 1024 * 1024) {
      text('Sem prévia: limite de cinco imagens / 20 MiB por relatório.');
      return;
    }
    try {
      const bytes = await read(asset.key, 10 * 1024 * 1024);
      readBytes += bytes.length;
      if (asset.sha256 && createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
        throw new Error('digest');
      const size = imageSize(bytes);
      if (!size.width || !size.height || size.width * size.height > 16000000) {
        text('Sem prévia: imagem excede o limite de 16 milhões de pixels.');
        return;
      }
      if (doc.y > doc.page.height - 260) doc.addPage();
      const y = doc.y;
      doc.image(bytes, 48, y, { fit: [490, 180] });
      doc.y = y + 190;
      doc.x = 48;
      previews++;
    } catch {
      text('Evidência indisponível para prévia. Consulte o original no portal.');
    }
  }
  try {
    doc.font('Bold').fontSize(19).fillColor('#10354b').text('Portal de Segurança');
    doc.moveDown(0.6);
    heading('Relatório de inspeção');
    text(s.form.title);
    text(`${s.unitName} · ${s.sectorName}`);
    text(
      `Formulário v${s.versionNumber} · Ciclo ${s.submission.cycle} · Revisão concluída ${s.submission.sourceRevision}`,
    );
    text(`Concluída em ${instant(s.submission.completedAt)} por ${s.completedByName}`);
    text(`Gerado em ${instant(s.requestedAt)} por ${s.requestedBy}`);
    text(`Inspeção: ${s.inspectionId} · Conclusão: ${s.submission.id}`);
    for (const section of s.form.sections) {
      const questions = section.questions.filter((q) => s.visibleQuestionIds.includes(q.id));
      if (!questions.length) continue;
      heading(section.title);
      for (const q of questions) {
        heading(q.label);
        text(
          `Resposta: ${answer(q, s.submission.answers.find((a) => a.questionId === q.id)?.value)}`,
        );
        const note = s.submission.notes.find((n) => n.questionId === q.id);
        if (note) text(`Observação: ${note.text}`);
        for (const file of s.submission.evidence.filter((f) => f.questionId === q.id))
          await evidence(file);
      }
    }
    heading('Não conformidades');
    if (!s.submission.nonconformities.length) text('Nenhuma não conformidade nesta conclusão.');
    for (const nc of s.submission.nonconformities) {
      const q = s.form.sections
        .flatMap((section) => section.questions)
        .find((q) => q.id === nc.questionId);
      text(
        `${q?.label ?? nc.questionId} · ${nc.category} · Prioridade ${priorities[nc.priority] ?? nc.priority}`,
      );
    }
    heading('Planos de ação autorizados desta conclusão');
    if (!s.plans.length) text('Nenhum plano disponível para seu acesso neste recorte.');
    for (const plan of s.plans) {
      heading(plan.description);
      text(
        `${states[plan.state]} · ${priorities[plan.priority] ?? plan.priority} · Prazo ${dateOnly(plan.dueDate)}`,
      );
      text(`Responsável: ${plan.responsibleName} · Plano: ${plan.id}`);
      for (const e of plan.history) {
        text(`${instant(e.createdAt)} · ${e.actorName} · ${eventLabels[e.type] ?? e.type}`);
        if (e.text) text(e.text);
        if (e.assignment)
          text(
            `Atribuição: ${e.assignment.responsibleName} · ${dateOnly(e.assignment.dueDate)} · ${priorities[e.assignment.priority]}`,
          );
        for (const file of e.evidence) await evidence(file);
      }
    }
    heading('Critérios do documento');
    text(
      'Documento estático da conclusão selecionada, com os planos visíveis ao solicitante. Alterações posteriores não atualizam este arquivo. Evidências são identificadas por nome e checksum; prévias ausentes ou limitadas são indicadas explicitamente. Datas e horários em São Paulo.',
    );
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc
        .font('Regular')
        .fontSize(8)
        .fillColor('#536477')
        .text(`Portal de Segurança · ${i + 1} / ${pages.count}`, 48, doc.page.height - 35, {
          lineBreak: false,
        });
    }
    doc.end();
    return await output;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}
