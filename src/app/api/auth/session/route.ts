import { getSessionFromCookie } from '@/lib/auth/local-session';

export async function GET() {
  const session = await getSessionFromCookie();

  return Response.json({ user: session?.user ?? null });
}
