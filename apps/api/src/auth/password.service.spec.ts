import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('password hashing', () => {
  const passwords = new PasswordService();

  it('stores a salted Argon2id digest and verifies the original password', async () => {
    const password = 'Uma senha longa para o portal!';
    const first = await passwords.hash(password);
    const second = await passwords.hash(password);
    expect(first).toMatch(/^\$argon2id\$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await passwords.verify(first, password)).toBe(true);
    expect(await passwords.verify(first, 'Uma senha incorreta qualquer')).toBe(false);
  });
});
