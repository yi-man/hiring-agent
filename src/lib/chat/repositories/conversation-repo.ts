import type { Conversation, ConversationStatus } from '@/types/chat';
import { prisma } from '@/lib/prisma';

type ConversationRecord = {
  id: string;
  userId: string | null;
  title: string | null;
  status: string;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function mapRow(row: ConversationRecord): Conversation {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    status: row.status as ConversationStatus,
    lastActiveAt: row.lastActiveAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createConversation(userId?: string | null): Promise<Conversation> {
  const now = new Date();
  const row = await prisma.conversation.create({
    data: {
      userId: userId ?? null,
      status: 'active',
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
  return mapRow(row);
}

export async function listConversations(limit = 50): Promise<Conversation[]> {
  const rows = await prisma.conversation.findMany({
    orderBy: { lastActiveAt: 'desc' },
    take: limit,
  });
  return rows.map(mapRow);
}

export async function listConversationsPaginated(params: {
  limit: number;
  offset: number;
}): Promise<Conversation[]> {
  const rows = await prisma.conversation.findMany({
    orderBy: { lastActiveAt: 'desc' },
    take: params.limit,
    skip: params.offset,
  });
  return rows.map(mapRow);
}

export async function countConversations(): Promise<number> {
  return prisma.conversation.count();
}

export async function touchConversation(conversationId: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    },
  });
}
