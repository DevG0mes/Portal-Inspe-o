import { expect, it } from 'vitest';
import { versionSummary } from './form-state.js';
import { FormVersion } from './entities/form-version.entity.js';
import { FormTemplate } from './entities/form-template.entity.js';
import { User } from '../identity/user.entity.js';
it('history identifies the publisher by a safe display name', () => {
  const version = new FormVersion();
  version.template = new FormTemplate();
  version.publishedBy = new User();
  version.publishedBy.name = 'Responsável';
  version.publishedBy.passwordHash = 'private';
  expect(versionSummary(version)).toHaveProperty('publishedByName', 'Responsável');
  expect(versionSummary(version)).not.toHaveProperty('passwordHash');
});
