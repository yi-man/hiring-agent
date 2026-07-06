import { fetchCompanyProfile, saveCompanyProfile } from '@/lib/company-profile/client';

const profile = {
  id: 'profile-1',
  userId: 'u1',
  name: '深海数据',
  locations: [
    {
      id: 'loc-1',
      kind: 'office' as const,
      label: '上海张江',
      city: '上海',
      address: '博云路 2 号',
      sortOrder: 0,
    },
  ],
  createdAt: '2026-07-06T01:00:00.000Z',
  updatedAt: '2026-07-06T02:00:00.000Z',
};

describe('company profile client', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('fetches the current company profile', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile }),
    });

    await expect(fetchCompanyProfile()).resolves.toEqual(profile);
    expect(global.fetch).toHaveBeenCalledWith('/api/company-profile');
  });

  it('saves the current company profile', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile }),
    });

    await expect(
      saveCompanyProfile({
        name: '深海数据',
        locations: [{ kind: 'remote', label: '远程', city: null, address: null }],
      }),
    ).resolves.toEqual(profile);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/company-profile',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '深海数据',
          locations: [{ kind: 'remote', label: '远程', city: null, address: null }],
        }),
      }),
    );
  });
});
