import {
  createConversation,
  listConversations,
  touchConversation,
} from '@/lib/chat/repositories/conversation-repo';
import { createMessage, listMessages } from '@/lib/chat/repositories/message-repo';

const execute = jest.fn();
const query = jest.fn();

jest.mock('@/lib/chat/mysql', () => ({
  getMySqlPool: () => ({
    execute,
    query,
  }),
}));

describe('chat repositories', () => {
  beforeEach(() => {
    execute.mockReset();
    query.mockReset();
  });

  it('creates conversation and maps fields', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 'c1',
          user_id: 'u1',
          title: null,
          status: 'active',
          last_active_at: '2026-03-26T00:00:00.000Z',
          created_at: '2026-03-26T00:00:00.000Z',
          updated_at: '2026-03-26T00:00:00.000Z',
        },
      ],
    ]);

    const result = await createConversation('u1');
    expect(execute).toHaveBeenCalled();
    expect(result.id).toBe('c1');
    expect(result.userId).toBe('u1');
    expect(result.status).toBe('active');
  });

  it('lists conversations ordered by lastActiveAt from DB', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 'c2',
          user_id: null,
          title: 'latest',
          status: 'active',
          last_active_at: '2026-03-26T01:00:00.000Z',
          created_at: '2026-03-26T01:00:00.000Z',
          updated_at: '2026-03-26T01:00:00.000Z',
        },
      ],
    ]);
    const rows = await listConversations();
    expect(rows[0].id).toBe('c2');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY last_active_at DESC'),
      expect.any(Array),
    );
  });

  it('increments message sequence before insert', async () => {
    query.mockResolvedValueOnce([[{ maxSeq: 2 }]]);
    const message = await createMessage({
      conversationId: 'c1',
      role: 'user',
      content: 'hello',
    });
    expect(message.seq).toBe(3);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO messages'),
      expect.arrayContaining([expect.any(String), 'c1', 'user', 'hello', 3]),
    );
  });

  it('lists messages ordered by seq asc', async () => {
    query.mockResolvedValueOnce([
      [
        {
          id: 'm1',
          conversation_id: 'c1',
          role: 'user',
          content: 'a',
          seq: 1,
          token_count: null,
          created_at: '2026-03-26T01:00:00.000Z',
        },
      ],
    ]);
    const rows = await listMessages('c1');
    expect(rows[0].seq).toBe(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY seq ASC'),
      expect.any(Array),
    );
  });

  it('touches conversation last_active_at', async () => {
    await touchConversation('c1');
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE conversations SET last_active_at'),
      expect.arrayContaining([expect.any(Date), expect.any(Date), 'c1']),
    );
  });
});
