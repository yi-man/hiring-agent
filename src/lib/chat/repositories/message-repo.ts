import { randomUUID } from 'crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type { ChatRole, Message } from '@/types/chat';
import { getMySqlPool } from '@/lib/chat/mysql';

type MessageRow = RowDataPacket & {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  seq: number;
  token_count: number | null;
  created_at: Date | string;
};

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function mapRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    seq: row.seq,
    tokenCount: row.token_count,
    createdAt: toIso(row.created_at),
  };
}

async function nextSequence(conversationId: string): Promise<number> {
  const pool = getMySqlPool();
  const [rows] = await pool.query<Array<RowDataPacket & { maxSeq: number | null }>>(
    'SELECT MAX(seq) AS maxSeq FROM messages WHERE conversation_id = ?',
    [conversationId],
  );
  const maxSeq = rows[0]?.maxSeq ?? 0;
  return maxSeq + 1;
}

export async function createMessage(params: {
  conversationId: string;
  role: ChatRole;
  content: string;
  tokenCount?: number | null;
}): Promise<Message> {
  const pool = getMySqlPool();
  const id = randomUUID();
  const seq = await nextSequence(params.conversationId);
  const now = new Date();
  await pool.execute(
    `INSERT INTO messages (id, conversation_id, role, content, seq, token_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, params.conversationId, params.role, params.content, seq, params.tokenCount ?? null, now],
  );
  return {
    id,
    conversationId: params.conversationId,
    role: params.role,
    content: params.content,
    seq,
    tokenCount: params.tokenCount ?? null,
    createdAt: now.toISOString(),
  };
}

export async function listMessages(conversationId: string, limit = 100): Promise<Message[]> {
  const pool = getMySqlPool();
  const [rows] = await pool.query<MessageRow[]>(
    `SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC LIMIT ?`,
    [conversationId, limit],
  );
  return rows.map(mapRow);
}
