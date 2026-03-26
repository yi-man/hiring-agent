import { randomUUID } from 'crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type { Conversation, ConversationStatus } from '@/types/chat';
import { getMySqlPool } from '@/lib/chat/mysql';

type ConversationRow = RowDataPacket & {
  id: string;
  user_id: string | null;
  title: string | null;
  status: ConversationStatus;
  last_active_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function mapRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    lastActiveAt: toIso(row.last_active_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function createConversation(userId?: string | null): Promise<Conversation> {
  const id = randomUUID();
  const now = new Date();
  const pool = getMySqlPool();
  await pool.execute(
    `INSERT INTO conversations (id, user_id, status, last_active_at, created_at, updated_at)
     VALUES (?, ?, 'active', ?, ?, ?)`,
    [id, userId ?? null, now, now, now],
  );
  const [rows] = await pool.query<ConversationRow[]>(
    'SELECT * FROM conversations WHERE id = ? LIMIT 1',
    [id],
  );
  if (!rows.length) throw new Error('failed to create conversation');
  return mapRow(rows[0]);
}

export async function listConversations(limit = 50): Promise<Conversation[]> {
  const pool = getMySqlPool();
  const [rows] = await pool.query<ConversationRow[]>(
    `SELECT * FROM conversations ORDER BY last_active_at DESC LIMIT ? OFFSET ?`,
    [limit, 0],
  );
  return rows.map(mapRow);
}

export async function listConversationsPaginated(params: {
  limit: number;
  offset: number;
}): Promise<Conversation[]> {
  const pool = getMySqlPool();
  const [rows] = await pool.query<ConversationRow[]>(
    `SELECT * FROM conversations ORDER BY last_active_at DESC LIMIT ? OFFSET ?`,
    [params.limit, params.offset],
  );
  return rows.map(mapRow);
}

export async function countConversations(): Promise<number> {
  const pool = getMySqlPool();
  const [rows] = await pool.query<Array<RowDataPacket & { total: number }>>(
    'SELECT COUNT(*) AS total FROM conversations',
  );
  return Number(rows[0]?.total ?? 0);
}

export async function touchConversation(conversationId: string): Promise<void> {
  const pool = getMySqlPool();
  await pool.execute('UPDATE conversations SET last_active_at = ?, updated_at = ? WHERE id = ?', [
    new Date(),
    new Date(),
    conversationId,
  ]);
}
