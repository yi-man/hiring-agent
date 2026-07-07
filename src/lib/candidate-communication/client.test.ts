import { startCandidateCommunicationRun, syncUnreadCandidateConversations } from './client';

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

  it('starts candidate communication runs', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        run: {
          id: 'comm-run-1',
          userId: 'user-1',
          jobDescriptionId: 'jd-1',
          candidateId: null,
          platform: 'boss-like',
          mode: 'batch',
          status: 'success',
          stats: { total: 2, selected: 2, processed: 2, failed: 0, passes: 3, records: [] },
          errorMessage: null,
          startedAt: '2026-07-06T01:00:00.000Z',
          finishedAt: '2026-07-06T01:01:00.000Z',
          createdAt: '2026-07-06T01:00:00.000Z',
          updatedAt: '2026-07-06T01:01:00.000Z',
        },
      }),
    });

    await expect(
      startCandidateCommunicationRun({
        mode: 'batch',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        maxPasses: 10,
      }),
    ).resolves.toMatchObject({
      id: 'comm-run-1',
      mode: 'batch',
      status: 'success',
      stats: { processed: 2, failed: 0, passes: 3 },
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/candidate-conversations/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'batch',
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        maxPasses: 10,
      }),
    });
  });
});
