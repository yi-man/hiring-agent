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

const CONVERSATION_TITLE_MAX_LENGTH = 10;
const TRAILING_REQUEST_PATTERN =
  /(请|并|然后|再)\s*(给|列|提供|说明|补充)?\s*(我)?\s*(\d+|几)?\s*(个|条|点)?\s*(理由|原因|步骤|方案|建议).*/u;

function stripPunctuation(input: string): string {
  return input.replace(/[，。！？、；：,.!?;:"'“”‘’（）()【】\[\]<>《》]/g, '');
}

function compactTitle(input: string): string {
  return input.replace(/\s+/g, '');
}

function truncateTitle(input: string): string {
  const chars = Array.from(compactTitle(input).trim());
  if (chars.length <= CONVERSATION_TITLE_MAX_LENGTH) {
    return chars.join('');
  }
  return chars.slice(0, CONVERSATION_TITLE_MAX_LENGTH).join('');
}

function summarizeQuestion(raw: string): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '新会话';
  }

  const whyMatch = normalized.match(/^(为什么|为何)\s*(.+?)(?:[？?。!！]|$)/u);
  if (whyMatch) {
    let topic = whyMatch[2].replace(TRAILING_REQUEST_PATTERN, '').trim();
    topic = topic
      .replace(/^(这个|这|该)?(岗位|职位)\s*(为什么|为何)?\s*(需要|要)\s*/u, '')
      .replace(/^(这个|这|该)?\s*/u, '')
      .replace(/^(要|需要)\s*/u, '');
    const compact = compactTitle(stripPunctuation(topic)).trim();
    if (compact) return truncateTitle(compact);
  }

  const howMatch = normalized.match(/^(怎么|如何|怎样)\s*(.+?)(?:[？?。!！]|$)/u);
  if (howMatch) {
    const topic = compactTitle(stripPunctuation(howMatch[2])).trim();
    if (topic) return truncateTitle(`${topic}方法`);
  }

  const whatIsMatch = normalized.match(/^(什么是)\s*(.+?)(?:[？?。!！]|$)/u);
  if (whatIsMatch) {
    const topic = compactTitle(stripPunctuation(whatIsMatch[2])).trim();
    if (topic) return truncateTitle(`${topic}定义`);
  }

  const compact = compactTitle(
    stripPunctuation(
      normalized.replace(
        /(请问|请|帮我|麻烦|一下|给我|一个|一些|这个|那个|是否|为什么|为何|怎么|如何|怎样|能否|可以|吗|呢)/gu,
        '',
      ),
    ),
  ).trim();
  if (compact) return truncateTitle(compact);

  return truncateTitle(stripPunctuation(normalized)) || '新会话';
}

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
    const shouldSetConversationTitle = params.role === 'user' && nextSeq === 1;
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
        ...(shouldSetConversationTitle ? { title: summarizeQuestion(params.content) } : {}),
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
