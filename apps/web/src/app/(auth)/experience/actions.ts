'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/session';
import { homeFor, parsePresentation, PRESENTATION_COOKIE } from '../../../lib/presentation';
export async function choosePresentation(data: FormData) {
  const session = await requireSession();
  const mode = parsePresentation(String(data.get('mode') ?? ''));
  if (!mode) redirect('/experience');
  (await cookies()).set(PRESENTATION_COOKIE, mode, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  redirect(homeFor(session.role));
}
