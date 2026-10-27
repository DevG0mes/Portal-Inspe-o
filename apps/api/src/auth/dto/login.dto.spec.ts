import { describe, expect, it } from 'vitest';
import { parseLogin } from './login.dto.js';
import { parseChangePassword } from './change-password.dto.js';

describe('authentication input boundaries', () => {
  it('normalizes only email while preserving password whitespace', () => {
    expect(parseLogin({ email: '  Ana@PSI.test ', password: '  senha longa  ' })).toEqual({
      email: 'ana@psi.test',
      password: '  senha longa  ',
    });
  });

  it('rejects oversized passwords and unexpected properties', () => {
    expect(() => parseLogin({ email: 'ana@psi.test', password: 'x'.repeat(129) })).toThrow();
    expect(() => parseLogin({ email: 'ana@psi.test', password: 'senha', role: 'ADMIN' })).toThrow();
  });

  it('requires a long new password without silently trimming it', () => {
    expect(() => parseChangePassword({ currentPassword: 'old', newPassword: 'short' })).toThrow();
    expect(
      parseChangePassword({ currentPassword: 'old', newPassword: '  senha longa para o portal  ' })
        .newPassword,
    ).toBe('  senha longa para o portal  ');
  });
});
