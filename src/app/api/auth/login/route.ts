import { DEFAULT_USERNAME, ensureDefaultUser } from '@/lib/auth/default-user';
import { createUserSession } from '@/lib/auth/local-session';
import { verifyPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/prisma';

type LoginBody = {
  username?: unknown;
  password?: unknown;
};

function invalidCredentials() {
  return Response.json({ error: 'Invalid username or password' }, { status: 401 });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { username: rawUsername, password: rawPassword } = body as LoginBody;
  const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';

  if (!username || !password) {
    return Response.json({ error: 'Username and password are required' }, { status: 400 });
  }

  const userSelect = {
    id: true,
    username: true,
    passwordHash: true,
    name: true,
    email: true,
    image: true,
  } as const;

  if (username === DEFAULT_USERNAME) {
    await ensureDefaultUser();
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: userSelect,
  });

  if (!user) {
    return invalidCredentials();
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    return invalidCredentials();
  }

  await createUserSession(user.id);

  return Response.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      image: user.image,
    },
  });
}
