import { syncUnreadCandidateConversations } from './client';

describe('candidate communication client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('posts unread communication sync requests', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        stoppedReason: 'no_unread_messages',
        processed: 2,
        failed: 0,
        passes: 3,
      }),
    });

    await expect(
      syncUnreadCandidateConversations({
        platform: 'boss-like',
        maxPasses: 10,
      }),
    ).resolves.toEqual({
      status: 'success',
      stoppedReason: 'no_unread_messages',
      processed: 2,
      failed: 0,
      passes: 3,
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/candidate-conversations/sync-unread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'boss-like',
        maxPasses: 10,
      }),
    });
  });

  it('surfaces sync errors from the API', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'browser login required' }),
    });

    await expect(
      syncUnreadCandidateConversations({ platform: 'boss-like', maxPasses: 10 }),
    ).rejects.toThrow('browser login required');
  });
});
