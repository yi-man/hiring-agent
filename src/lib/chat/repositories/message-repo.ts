import type { ChatRole, Message } from '@/types/chat';
import { prisma } from '@/lib/prisma';

type MessageRow = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  documentId: string | null;
  seq: number;
  tokenCount: number | null;
  createdAt: Date;
};

function mapRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as ChatRole,
    content: row.content,
    documentId: row.documentId,
    seq: row.seq,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createMessage(params: {
  conversationId: string;
  role: ChatRole;
  content: string;
  documentId?: string | null;
  tokenCount?: number | null;
}): Promise<Message> {
  return prisma.$transaction(async (tx) => {
    const top = await tx.message.findFirst({
      where: { conversationId: params.conversationId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const nextSeq = (top?.seq ?? 0) + 1;
    const created = await tx.message.create({
      data: {
        conversationId: params.conversationId,
        role: params.role,
        content: params.content,
        documentId: params.documentId ?? null,
        seq: nextSeq,
        tokenCount: params.tokenCount ?? null,
      },
    });
    await tx.conversation.update({
      where: { id: params.conversationId },
      data: {
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return mapRow(created as MessageRow);
  });
}

export async function listMessages(conversationId: string, limit = 100): Promise<Message[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { seq: 'asc' },
    take: limit,
  });
  return rows.map(mapRow);
}
