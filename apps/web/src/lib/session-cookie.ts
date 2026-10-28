/** Only the opaque session cookie is allowed across the server/API boundary. */
export function sessionCookie(header: string | null): string | undefined {
  const values = header
    ?.split(';')
    .map((item) => item.trim())
    .filter((item) => item.startsWith('portal_session='));
  if (values?.length !== 1 || !/^portal_session=[A-Za-z0-9_-]{43}$/.test(values[0]!))
    return undefined;
  return values[0];
}

/** Frontend pages need the cookie at / for SSR; the API keeps its own /api scope. */
export function frontendCookies(cookie: string): string[] {
  if (!cookie.startsWith('portal_session=')) return [];
  return [
    cookie.replace(/Path=\/api(?=;|$)/i, 'Path=/'),
    'portal_session=; Path=/api; Max-Age=0; HttpOnly; SameSite=Strict' +
      (/; Secure/i.test(cookie) ? '; Secure' : ''),
  ];
}
