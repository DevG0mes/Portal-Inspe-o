import { expect, it } from 'vitest';
import { validateMetadata, validateContent } from './file-validation.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=',
  'base64',
);
it('rejects MIME values that collide with inherited object property names as validation errors', () => {
  for (const mime of ['constructor', '__proto__', 'toString'])
    expect(() => validateMetadata({ filename: 'foto.png', mime, size: 68 }, 1024)).toThrow(
      /Arquivo inválido/,
    );
});
it('accepts supported metadata and verifies actual content and size', () => {
  expect(
    validateMetadata({ filename: 'Foto.PNG', mime: 'image/png', size: png.length }, 1024),
  ).toMatchObject({ filename: 'Foto.PNG' });
  expect(validateContent(png, { mime: 'image/png', size: png.length })).toMatch(/^[a-f0-9]{64}$/);
});
it('rejects unsafe names, inconsistent extensions, unsupported types and oversize content', () => {
  for (const filename of ['../foto.png', 'pasta\\foto.png', 'foto\r\n.png', 'foto.svg', 'foto.jpg'])
    expect(() => validateMetadata({ filename, mime: 'image/png', size: 30 }, 1024)).toThrow();
  expect(() =>
    validateMetadata({ filename: 'foto.png', mime: 'image/png', size: 1025 }, 1024),
  ).toThrow();
  expect(() =>
    validateMetadata({ filename: 'foto.svg', mime: 'image/svg+xml', size: 30 }, 1024),
  ).toThrow();
  expect(() =>
    validateContent(Buffer.from('<html>falso</html>'), { mime: 'image/png', size: 18 }),
  ).toThrow();
  expect(() => validateContent(png, { mime: 'image/png', size: png.length + 1 })).toThrow();
});
