import { NextResponse, type NextRequest } from 'next/server';
import { apiOrigin } from '../../../lib/api-server';
import { frontendCookies, sessionCookie } from '../../../lib/session-cookie';
export const dynamic = 'force-dynamic';
const MAX_BODY = 2 * 1024 * 1024;
/** Fixed upstream and validated path prevent this boundary from becoming an open proxy. */
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (
    !['auth', 'users', 'organization', 'forms'].includes(path[0] ?? '') ||
    path.some((part) => !/^[a-zA-Z0-9-]+$/.test(part))
  )
    return new NextResponse(null, { status: 404 });
  const headers = new Headers();
  const cookie = sessionCookie(request.headers.get('cookie'));
  if (cookie) headers.set('Cookie', cookie);
  let body: Uint8Array | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000';
    if (
      request.headers.get('origin') !== origin ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      return NextResponse.json({ message: 'Origem inválida.' }, { status: 403 });
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return new NextResponse(null, { status: 415 });
    headers.set('Origin', origin);
    headers.set('Content-Type', 'application/json');
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > MAX_BODY) {
          await reader.cancel();
          return new NextResponse(null, { status: 413 });
        }
        chunks.push(item.value);
      }
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  try {
    const upstream = await fetch(`${apiOrigin()}/api/${path.join('/')}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body: body as BodyInit | undefined,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
    const requestId = upstream.headers.get('x-request-id');
    if (requestId) response.headers.set('X-Request-Id', requestId);
    for (const cookie of upstream.headers.getSetCookie())
      for (const mapped of frontendCookies(cookie)) response.headers.append('Set-Cookie', mapped);
    return response;
  } catch {
    return NextResponse.json(
      { message: 'Serviço temporariamente indisponível.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE, proxy as PUT };
