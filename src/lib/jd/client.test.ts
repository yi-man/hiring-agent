import { updateJobDescriptionLifecycle } from '@/lib/jd/client';

describe('JD client lifecycle API', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('posts lifecycle actions and returns the updated JD', async () => {
    const jobDescription = { id: 'jd-1', status: 'offline' };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobDescription }),
    });

    await expect(updateJobDescriptionLifecycle('jd-1', { action: 'take_offline' })).resolves.toBe(
      jobDescription,
    );
    expect(global.fetch).toHaveBeenCalledWith('/api/jd/jd-1/lifecycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'take_offline' }),
    });
  });

  it('surfaces lifecycle API errors', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'hiring target is required before reopening' }),
    });

    await expect(updateJobDescriptionLifecycle('jd-1', { action: 'reopen' })).rejects.toThrow(
      'hiring target is required before reopening',
    );
  });
});
