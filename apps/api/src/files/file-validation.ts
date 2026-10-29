import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export const MIME_EXTENSIONS: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};
export function validateMetadata(
  input: { filename: string; mime: string; size: number },
  maxBytes: number,
) {
  const filename = input.filename.normalize('NFC').trim();
  const extension = filename.split('.').at(-1)?.toLowerCase() ?? '';
  const extensions = Object.hasOwn(MIME_EXTENSIONS, input.mime)
    ? MIME_EXTENSIONS[input.mime]
    : undefined;
  if (
    !filename ||
    filename.length > 160 ||
    /[/\\]/.test(filename) ||
    [...filename].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    !extensions?.includes(extension) ||
    !Number.isInteger(input.size) ||
    input.size < 1 ||
    input.size > maxBytes
  )
    throw new BadRequestException(
      'Arquivo inválido. Use JPEG, PNG, WEBP ou PDF dentro do limite informado.',
    );
  return { ...input, filename };
}
export function validateContent(bytes: Buffer, expected: { mime: string; size: number }) {
  const matches =
    expected.mime === 'image/png'
      ? bytes.length >= 33 &&
        bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
        bytes.toString('ascii', 12, 16) === 'IHDR'
      : expected.mime === 'image/jpeg'
        ? bytes.length >= 4 &&
          bytes[0] === 255 &&
          bytes[1] === 216 &&
          bytes.at(-2) === 255 &&
          bytes.at(-1) === 217
        : expected.mime === 'image/webp'
          ? bytes.length >= 16 &&
            bytes.toString('ascii', 0, 4) === 'RIFF' &&
            bytes.toString('ascii', 8, 12) === 'WEBP' &&
            bytes.readUInt32LE(4) + 8 === bytes.length
          : expected.mime === 'application/pdf'
            ? bytes.toString('ascii', 0, 5) === '%PDF-' &&
              bytes.subarray(-1024).toString('ascii').includes('%%EOF')
            : false;
  if (bytes.length !== expected.size || !matches)
    throw new BadRequestException(
      'O conteúdo do arquivo não corresponde ao tipo ou tamanho informado.',
    );
  return createHash('sha256').update(bytes).digest('hex');
}
