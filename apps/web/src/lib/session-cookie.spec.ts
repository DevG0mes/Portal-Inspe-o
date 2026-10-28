import { expect, it } from 'vitest';
import { frontendCookies, sessionCookie } from './session-cookie';

it('rejects duplicate sessions and forwards no other cookies', () => {
  const token = 'a'.repeat(43);
  expect(sessionCookie(`other=secret; portal_session=${token}`)).toBe(`portal_session=${token}`);
  expect(sessionCookie(`portal_session=${token}; portal_session=${token}`)).toBeUndefined();
  expect(sessionCookie('portal_session=invalid')).toBeUndefined();
});

it('scopes HttpOnly session to SSR pages and expires the old API path', () => {
  const cookies = frontendCookies(
    'portal_session=opaque; Path=/api; HttpOnly; SameSite=Strict; Secure',
  );
  expect(cookies[0]).toContain('Path=/; HttpOnly; SameSite=Strict; Secure');
  expect(cookies[1]).toContain('Path=/api; Max-Age=0');
  expect(cookies[1]).toContain('Secure');
  expect(frontendCookies('other=secret')).toEqual([]);
});
