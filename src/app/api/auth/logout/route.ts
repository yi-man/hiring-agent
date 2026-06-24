import { clearSessionCookie } from '@/lib/auth/local-session';

export async function POST() {
  await clearSessionCookie();

  return Response.json({ ok: true });
}
