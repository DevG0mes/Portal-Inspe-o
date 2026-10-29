export interface EvidenceFile {
  id: string;
  questionId: string;
  filename: string;
  mime: string;
  size: number;
  sha256: string | null;
  status: 'PENDING' | 'UPLOADED' | 'READY';
  expiresAt: string | null;
}
export interface EvidenceReceipt {
  revision: number;
  files: EvidenceFile[];
}
export interface UploadPolicy {
  maxBytes: number;
  maxFiles: number;
  allowedMimeTypes: string[];
  accept: string;
}
