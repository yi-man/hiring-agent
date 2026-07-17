import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CompanyProfilePage } from '@/components/company-profile/company-profile-page';

describe('CompanyProfilePage', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('creates a company profile with office and remote work locations', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          profile: null,
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
              id: 'liepin',
              label: '猎聘',
              shortLabel: '猎聘',
              description: '猎聘企业端',
              kind: 'production',
              defaultBaseUrl: 'https://lpt.liepin.com',
              defaultVariables: {},
            },
            {
              id: 'boss-like',
              label: 'BOSS-like（本地）',
              shortLabel: 'BOSS-like',
              description: '本地测试站',
              kind: 'local',
              defaultBaseUrl: 'http://localhost:6183',
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
            supportedPlatforms: ['boss', 'liepin'],
            platformConfigs: [
              {
                id: 'config-boss',
                platformId: 'boss',
                baseUrl: 'https://www.zhipin.com',
                username: '',
                hasPassword: false,
                variables: {},
              },
              {
                id: 'config-liepin',
                platformId: 'liepin',
                baseUrl: 'https://lpt.liepin.com',
                username: '',
                hasPassword: false,
                variables: {},
              },
            ],
            locations: [
              {
                id: 'loc-1',
                kind: 'office',
                label: '上海张江',
                city: '上海',
                address: '博云路 2 号',
                sortOrder: 0,
              },
              {
                id: 'loc-2',
                kind: 'remote',
                label: '远程',
                city: null,
                address: null,
                sortOrder: 1,
              },
            ],
            createdAt: '2026-07-06T01:00:00.000Z',
            updatedAt: '2026-07-06T02:00:00.000Z',
          },
        }),
      });

    render(<CompanyProfilePage />);

    fireEvent.change(await screen.findByLabelText('公司名称'), {
      target: { value: '深海数据' },
    });
    fireEvent.click(screen.getByText('BOSS 直聘'));
    fireEvent.click(screen.getByText('猎聘'));
    fireEvent.click(screen.getByRole('checkbox', { name: /BOSS-like/ }));
    fireEvent.change(screen.getByLabelText('工作地点 1'), {
      target: { value: '上海张江' },
    });
    fireEvent.change(screen.getByLabelText('城市 1'), {
      target: { value: '上海' },
    });
    fireEvent.change(screen.getByLabelText('详细地址 1'), {
      target: { value: '博云路 2 号' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加远程' }));
    fireEvent.click(screen.getByRole('button', { name: '保存公司信息' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/company-profile',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            name: '深海数据',
            supportedPlatforms: ['boss', 'liepin'],
            locations: [
              {
                kind: 'office',
                label: '上海张江',
                city: '上海',
                address: '博云路 2 号',
              },
              {
                kind: 'remote',
                label: '远程',
                city: null,
                address: null,
              },
            ],
          }),
        }),
      );
    });
    expect(await screen.findByText('公司信息已保存')).toBeInTheDocument();
    expect(screen.queryByLabelText('BOSS 直聘平台地址')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '管理平台连接' })).toHaveAttribute(
      'href',
      '/settings/recruitment-platforms',
    );
  });
});
