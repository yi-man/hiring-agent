/** @jest-environment node */
import '../chat/test-env';
import { sessionCookieStore } from './session-cookie-store';

jest.mock('next/headers', () => {
  return {
    cookies: async () => ({
      get: (name: string) =>
        name === 'hiring-agent.session' && sessionCookieStore.token
          ? { name, value: sessionCookieStore.token }
          : undefined,
    }),
    headers: async () => new Headers(),
  };
});

import {
  assertPostgresReachable,
  assertRedisReachable,
  ensureIntegrationSchema,
  requireIntegrationEnv,
} from '../chat/test-env';
import { POST as postConversation } from '@/app/api/conversations/route';
import { GET as getMessages } from '@/app/api/conversations/[id]/messages/route';
import { createUserWithSessionFixture } from './test-fixtures';

describe('auth integration with real postgres and redis', () => {
  beforeAll(async () => {
    requireIntegrationEnv('POSTGRES_HOST');
    requireIntegrationEnv('POSTGRES_PORT');
    requireIntegrationEnv('POSTGRES_USER');
    requireIntegrationEnv('POSTGRES_DATABASE');
    requireIntegrationEnv('REDIS_URL');
    await ensureIntegrationSchema();
    await assertPostgresReachable();
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
