/** @jest-environment node */
import '../chat/test-env';
import { prisma } from '@/lib/prisma';
import { sessionCookieStore } from './session-cookie-store';

jest.mock('@auth/prisma-adapter', () => {
  return {
    PrismaAdapter: () => ({
      getSessionAndUser: async (sessionToken: string) => {
        const userAndSession = await prisma.session.findUnique({
          where: { sessionToken },
          include: { user: true },
        });
        if (!userAndSession) return null;
        const { user, ...session } = userAndSession;
        return { user, session };
      },
      createSession: (data: { sessionToken: string; userId: string; expires: Date }) =>
        prisma.session.create({ data }),
      updateSession: (data: { sessionToken: string; expires: Date }) =>
        prisma.session.update({
          where: { sessionToken: data.sessionToken },
          data: { expires: data.expires },
        }),
      deleteSession: (sessionToken: string) => prisma.session.delete({ where: { sessionToken } }),
    }),
  };
});

jest.mock('next/headers', () => {
  return {
    cookies: async () => ({
      getAll: () =>
        sessionCookieStore.token
          ? [{ name: 'next-auth.session-token', value: sessionCookieStore.token }]
          : [],
    }),
    headers: async () => new Headers(),
  };
});

import {
  assertMysqlReachable,
  assertRedisReachable,
  ensureIntegrationSchema,
  requireIntegrationEnv,
} from '../chat/test-env';
import { POST as postConversation } from '@/app/api/conversations/route';
import { GET as getMessages } from '@/app/api/conversations/[id]/messages/route';
import { createUserWithSessionFixture } from './test-fixtures';

describe('auth integration with real mysql and redis', () => {
  beforeAll(async () => {
    requireIntegrationEnv('MYSQL_HOST');
    requireIntegrationEnv('MYSQL_PORT');
    requireIntegrationEnv('MYSQL_USER');
    requireIntegrationEnv('MYSQL_PASS');
    requireIntegrationEnv('MYSQL_DATABASE');
    requireIntegrationEnv('REDIS_URL');
    requireIntegrationEnv('NEXTAUTH_SECRET');
    await ensureIntegrationSchema();
    await assertMysqlReachable();
    await assertRedisReachable();
  }, 60000);

  beforeEach(() => {
    sessionCookieStore.token = '';
  });

  it('returns 401 when creating a conversation without a session', async () => {
    const res = await postConversation();
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(String(body.error ?? '')).toMatch(/unauthorized/i);
  });

  it('creates a conversation scoped to the authenticated user', async () => {
    const fixture = await createUserWithSessionFixture();
    try {
      sessionCookieStore.token = fixture.sessionToken;
      const res = await postConversation();
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.conversation?.userId).toBe(fixture.userId);
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns 404 when fetching messages for another user conversation', async () => {
    const owner = await createUserWithSessionFixture();
    const other = await createUserWithSessionFixture();
    try {
      const { prisma } = await import('@/lib/prisma');
      const conv = await prisma.conversation.create({
        data: {
          userId: owner.userId,
          status: 'active',
          lastActiveAt: new Date(),
        },
      });

      sessionCookieStore.token = other.sessionToken;
      const res = await getMessages({} as Request, {
        params: Promise.resolve({ id: conv.id }),
      });
      expect(res.status).toBe(404);
    } finally {
      await owner.cleanup();
      await other.cleanup();
    }
  });

  it('returns 404 when fetching a legacy conversation with null userId', async () => {
    const fixture = await createUserWithSessionFixture();
    try {
      const { prisma } = await import('@/lib/prisma');
      const conv = await prisma.conversation.create({
        data: {
          userId: null,
          status: 'active',
          lastActiveAt: new Date(),
        },
      });

      sessionCookieStore.token = fixture.sessionToken;
      const res = await getMessages({} as Request, {
        params: Promise.resolve({ id: conv.id }),
      });
      expect(res.status).toBe(404);
    } finally {
      await fixture.cleanup();
    }
  });
});
