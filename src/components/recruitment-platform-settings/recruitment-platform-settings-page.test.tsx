import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecruitmentPlatformSettingsPage } from './recruitment-platform-settings-page';

describe('RecruitmentPlatformSettingsPage', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('allows preconfiguring platforms that are not enabled by default', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          profile: {
            id: 'profile-1',
            userId: 'u1',
            name: '深海数据',
            supportedPlatforms: ['zhilian'],
            platformConfigs: [
              {
                id: 'config-zhilian',
                platformId: 'zhilian',
                baseUrl: 'https://rd6.zhaopin.com',
                username: 'operator',
                hasPassword: true,
                variables: {},
              },
            ],
            interviewProcesses: [],
            locations: [
              {
                id: 'loc-1',
                kind: 'office',
                label: '上海张江',
                city: '上海',
                address: '博云路 2 号',
                sortOrder: 0,
              },
            ],
            createdAt: '2026-07-17T01:00:00.000Z',
            updatedAt: '2026-07-17T02:00:00.000Z',
          },
          platforms: [
            {
              id: 'boss',
              label: 'BOSS 直聘',
              shortLabel: 'BOSS',
              description: 'BOSS 直聘企业端',
              kind: 'production',
              defaultBaseUrl: 'https://www.zhipin.com',
              defaultVariables: {},
            },
            {
              id: 'zhilian',
              label: '智联招聘',
              shortLabel: '智联',
              description: '智联招聘企业端',
              kind: 'production',
              defaultBaseUrl: 'https://rd6.zhaopin.com',
              defaultVariables: {},
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          profile: {
            id: 'profile-1',
            userId: 'u1',
            name: '深海数据',
            supportedPlatforms: ['boss', 'zhilian'],
            platformConfigs: [],
            interviewProcesses: [],
            locations: [
              {
                id: 'loc-1',
                kind: 'office',
                label: '上海张江',
                city: '上海',
                address: '博云路 2 号',
                sortOrder: 0,
              },
            ],
            createdAt: '2026-07-17T01:00:00.000Z',
            updatedAt: '2026-07-17T02:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          profile: {
            id: 'profile-1',
            userId: 'u1',
            name: '深海数据',
            supportedPlatforms: ['boss', 'zhilian'],
            platformConfigs: [],
            interviewProcesses: [],
            locations: [
              {
                id: 'loc-1',
                kind: 'office',
                label: '上海张江',
                city: '上海',
                address: '博云路 2 号',
                sortOrder: 0,
              },
            ],
            createdAt: '2026-07-17T01:00:00.000Z',
            updatedAt: '2026-07-17T02:00:00.000Z',
          },
        }),
      });

    render(<RecruitmentPlatformSettingsPage />);

    expect(await screen.findByRole('heading', { name: '招聘平台' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '启用的招聘平台' })).toBeInTheDocument();
    expect(screen.getByLabelText('智联招聘平台地址')).toHaveValue('https://rd6.zhaopin.com');
    expect(screen.getByLabelText('BOSS 直聘平台地址')).toHaveValue('https://www.zhipin.com');
    expect(screen.queryByRole('link', { name: '去公司设置启用' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /BOSS 直聘/ }));
    fireEvent.change(screen.getByLabelText('智联招聘平台地址'), {
      target: { value: 'http://localhost:6183' },
    });
    fireEvent.change(screen.getByLabelText('智联招聘登录密码'), {
      target: { value: 'boss123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存招聘平台' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '深海数据',
          supportedPlatforms: ['boss', 'zhilian'],
          locations: [{ kind: 'office', label: '上海张江', city: '上海', address: '博云路 2 号' }],
        }),
      });
      expect(global.fetch).toHaveBeenNthCalledWith(3, '/api/company-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformConfigs: [
            {
              platformId: 'boss',
              baseUrl: 'https://www.zhipin.com',
              username: '',
              variables: {},
            },
            {
              platformId: 'zhilian',
              baseUrl: 'http://localhost:6183',
              username: 'operator',
              password: 'boss123',
              variables: {},
            },
          ],
        }),
      });
    });
    expect(await screen.findByText('招聘平台已保存')).toBeInTheDocument();
  });
});
