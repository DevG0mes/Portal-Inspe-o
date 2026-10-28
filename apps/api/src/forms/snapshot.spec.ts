import { expect, it } from 'vitest';
import { definition, question } from '../../test/helpers/form-fixtures.js';
import { snapshotHash } from './snapshot.js';

it('keeps the content hash stable across JSONB object-key ordering', () => {
  const snapshot = definition([question('TEXT')]);
  const reordered = {
    sections: snapshot.sections,
    title: snapshot.title,
    schemaVersion: snapshot.schemaVersion,
  };
  expect(snapshotHash(reordered)).toBe(snapshotHash(snapshot));
});

it('changes the content hash when question order or content changes', () => {
  const snapshot = definition([question('TEXT'), question('NUMBER')]);
  const reversed = structuredClone(snapshot);
  reversed.sections[0]!.questions.reverse();
  expect(snapshotHash(reversed)).not.toBe(snapshotHash(snapshot));
  expect(snapshotHash({ ...snapshot, title: 'Outra inspeção' })).not.toBe(snapshotHash(snapshot));
});
