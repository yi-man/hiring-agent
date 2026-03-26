import { buildHistoryKey } from '@/lib/chat/history/redis-chat-history';

describe('redis chat history', () => {
  it('builds conversation scoped key', () => {
    expect(buildHistoryKey('abc')).toBe('chat:history:abc');
  });
});
