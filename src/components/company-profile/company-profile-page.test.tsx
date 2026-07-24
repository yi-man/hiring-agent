import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CompanyProfilePage } from '@/components/company-profile/company-profile-page';
import { DEFAULT_INTERVIEW_PROCESSES } from '@/lib/interviews/defaults';

const profile = {
  id: 'profile-1',
  userId: 'u1',
  name: '深海数据',
  supportedPlatforms: ['boss', 'liepin'],
  platformConfigs: [],
  interviewProcesses: [DEFAULT_INTERVIEW_PROCESSES[0]],
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
  createdAt: '2026-07-06T01:00:00.000Z',
  updatedAt: '2026-07-06T02:00:00.000Z',
};

function mockLoadAndSave() {
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile, platforms: [] }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ profile }),
    });
}

describe('CompanyProfilePage', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('shows only company information on the company page', async () => {
    mockLoadAndSave();

    render(<CompanyProfilePage section="company" />);

    const nameInput = await screen.findByLabelText('公司名称');
    expect(screen.queryByLabelText('工作地点 1')).not.toBeInTheDocument();
    expect(screen.queryByText('技术研发类')).not.toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: '深海科技' } });
    fireEvent.click(screen.getByRole('button', { name: '保存公司信息' }));

    await waitFor(() => {
      const [url, init] = (global.fetch as jest.Mock).mock.calls[1] as [string, RequestInit];
      const payload = JSON.parse(init.body as string);
      expect(url).toBe('/api/company-profile');
      expect(payload).toMatchObject({
        name: '深海科技',
        supportedPlatforms: ['boss', 'liepin'],
        locations: [{ kind: 'office', label: '上海张江', city: '上海', address: '博云路 2 号' }],
      });
      expect(payload.interviewProcesses).toHaveLength(1);
    });
    expect(await screen.findByText('公司信息已保存')).toBeInTheDocument();
  });

  it('edits work locations on a separate page', async () => {
    mockLoadAndSave();

    render(<CompanyProfilePage section="locations" />);

    expect(await screen.findByRole('heading', { name: '工作地点' })).toBeInTheDocument();
    expect(screen.queryByLabelText('公司名称')).not.toBeInTheDocument();
    expect(screen.queryByText('技术研发类')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加远程' }));
    fireEvent.click(screen.getByRole('button', { name: '保存工作地点' }));

    await waitFor(() => {
      const [, init] = (global.fetch as jest.Mock).mock.calls[1] as [string, RequestInit];
      const payload = JSON.parse(init.body as string);
      expect(payload.locations).toEqual([
        { kind: 'office', label: '上海张江', city: '上海', address: '博云路 2 号' },
        { kind: 'remote', label: '远程', city: null, address: null },
      ]);
    });
    expect(await screen.findByText('工作地点已保存')).toBeInTheDocument();
  });

  it('edits interview process templates on a separate page', async () => {
    mockLoadAndSave();

    render(<CompanyProfilePage section="interview-processes" />);

    expect(await screen.findByRole('heading', { name: '职位面试流程' })).toBeInTheDocument();
    expect(screen.queryByLabelText('公司名称')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('工作地点 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /技术研发类/ }));
    fireEvent.change(screen.getByLabelText('职位类型 1 自动匹配部门'), {
      target: { value: '技术部、平台研发部' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存面试流程' }));

    await waitFor(() => {
      const [, init] = (global.fetch as jest.Mock).mock.calls[1] as [string, RequestInit];
      const payload = JSON.parse(init.body as string);
      expect(payload.interviewProcesses[0]).toMatchObject({
        id: 'default-technical',
        autoMatch: {
          departments: ['技术部', '平台研发部'],
          positionKeywords: expect.arrayContaining(['前端', '后端']),
          isFallback: false,
        },
      });
    });
    expect(await screen.findByText('面试流程已保存')).toBeInTheDocument();
  });
});
