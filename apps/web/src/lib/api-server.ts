import 'server-only';
import { cookies } from 'next/headers';
import { sessionCookie } from './session-cookie';
export const apiOrigin = () => process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
export async function serverApi<T>(path: string): Promise<T | null> {
  const jar = await cookies();
  const cookie = sessionCookie(jar.toString());
  if (!cookie) return null;
  const response = await fetch(`${apiOrigin()}/api/${path}`, {
    headers: { Cookie: cookie },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Serviço indisponível. Tente novamente em instantes.');
  return response.json() as Promise<T>;
}
