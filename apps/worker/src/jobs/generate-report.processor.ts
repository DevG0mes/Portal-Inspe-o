import type { ReportSnapshot } from '@portal/contracts';
import { renderPdf } from '../reports/pdf.renderer.js';
import { renderXlsx } from '../reports/xlsx.renderer.js';
export function renderReport(
  snapshot: ReportSnapshot,
  read: (key: string, max: number) => Promise<Buffer>,
) {
  return snapshot.kind === 'INSPECTION' ? renderPdf(snapshot, read) : renderXlsx(snapshot);
}
