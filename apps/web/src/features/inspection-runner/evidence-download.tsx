'use client';
import type { EvidenceFile } from '@portal/contracts';
import { PrivateDownload } from '../shared/private-download';
export function EvidenceDownload({ file }: { file: EvidenceFile }) {
  return <PrivateDownload endpoint={`files/${file.id}/download`} filename={file.filename} />;
}
