import type { ElementType, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { JDCreateView, JDDetailView, JDListView } from '@/components/jd-generator/jd-pages';
import type { JobDescriptionDto } from '@/types';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: jest.fn(),
  }),
}));

jest.mock('@/components/ui', () => ({
  Button: ({
    as: Component = 'button',
    children,
    href,
    isDisabled,
    onClick,
    type = 'button',
  }: {
    as?: ElementType;
    children: ReactNode;
    href?: string;
    isDisabled?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
  }) => {
    const props =
      Component === 'button' ? { disabled: isDisabled, onClick, type } : { href, onClick };
    return <Component {...props}>{children}</Component>;
  },
  Chip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const sampleJobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '前端工程师',
  positionDescription: '负责增长业务体验建设',
  salaryRange: '30-50K',
  workLocations: ['上海张江', '远程'],
  tone: 'tech',
  status: 'created',
  content: {
    title: '前端工程师',
    summary: '负责增长业务体验建设',
    responsibilities: ['建设核心页面'],
    requirements: ['熟悉 TypeScript'],
    bonus: [],
    highlights: ['业务上下文清晰'],
  },
  evaluation: null,
  generationMeta: {
    model: 'mock-jd-agent',
    promptVersion: 'jd_v3.2',
    action: 'initial_generate',
    context: {
      used: true,
      query: '前端工程师',
      textLength: 10,
      matches: [
        {
          score: 0.91,
          documentId: 'doc-1',
          chunkId: 'chunk-1',
          chunkIndex: 0,
          filename: 'company.md',
          title: '公司介绍',
          sourceLabel: null,
        },
      ],
      warnings: [],
    },
  },
  createdAt: '2026-06-25T01:00:00.000Z',
  updatedAt: '2026-06-25T02:00:00.000Z',
};

const screenedJobDescription: JobDescriptionDto = {
  ...sampleJobDescription,
  status: 'published',
  screeningSummary: {
    status: 'screened',
    totalCandidateCount: 3,
    qualifiedCandidateCount: 2,
    latestRunId: 'run-1',
    latestRunStatus: 'success',
    latestRunUpdatedAt: '2026-07-06T03:00:00.000Z',
  },
};

const sampleCompanyProfile = {
  id: 'profile-1',
  userId: 'u1',
  name: '深海数据',
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
};

describe('JD pages', () => {
  beforeEach(() => {
    pushMock.mockReset();
    global.fetch = jest.fn();
  });

  it('renders the JD list with default published status filter and screening summary', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescriptions: [screenedJobDescription],
          total: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescriptions: [{ ...sampleJobDescription, status: 'created' }],
          total: 1,
        }),
      });

    render(<JDListView />);

    expect(await screen.findAllByText('前端工程师')).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledWith('/api/jd?status=published');
    expect(screen.getAllByText('published').length).toBeGreaterThan(0);
    expect(screen.getByText('已筛选')).toBeInTheDocument();
    expect(screen.getByText('合格 2 / 全部 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '新建 JD' })).toHaveAttribute(
      'href',
      '/jd-generator/new',
    );
    expect(screen.getByRole('link', { name: '详情' })).toHaveAttribute(
      'href',
      '/jd-generator/jd-1',
    );
    expect(screen.getByRole('button', { name: '继续筛选' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '筛选记录' })).toHaveAttribute(
      'href',
      '/jd-generator/jd-1/screening-runs/run-1',
    );
    expect(screen.getByRole('link', { name: '候选人' })).toHaveAttribute(
      'href',
      '/jd-generator/jd-1/candidates',
    );

    fireEvent.change(screen.getByLabelText('JD 状态筛选'), { target: { value: 'created' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenLastCalledWith('/api/jd?status=created');
    });
  });

  it('creates a JD from selected department and position', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: sampleCompanyProfile }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescription: sampleJobDescription,
        }),
      });

    render(<JDCreateView />);

    const companyName = await screen.findByLabelText('公司名称');
    await waitFor(() => {
      expect(companyName).toHaveValue('深海数据');
    });
    expect(companyName).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('部门'), { target: { value: '技术部' } });
    fireEvent.change(screen.getByLabelText('职位'), { target: { value: '前端工程师' } });
    fireEvent.change(screen.getByLabelText('薪资范围'), { target: { value: '30-50K' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '远程' }));
    fireEvent.change(screen.getByLabelText('职位说明'), {
      target: { value: '负责增长业务体验建设' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成并创建' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            department: '技术部',
            position: '前端工程师',
            positionDescription: '负责增长业务体验建设',
            salaryRange: '30-50K',
            workLocations: ['上海张江', '远程'],
            tone: 'tech',
          }),
        }),
      );
    });
    expect(pushMock).toHaveBeenCalledWith('/jd-generator/jd-1/runs/create');
  });

  it('regenerates editable JD detail from the primary action area', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobDescription: sampleJobDescription }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tasks: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: sampleCompanyProfile }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescription: {
            ...sampleJobDescription,
            content: { ...sampleJobDescription.content, summary: '手动调整后的 JD' },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobDescription: sampleJobDescription }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    const summary = await screen.findByLabelText('岗位摘要');
    fireEvent.change(summary, { target: { value: '手动调整后的 JD' } });

    fireEvent.change(screen.getByLabelText('追加要求'), {
      target: { value: '强调 AI 招聘经验' },
    });
    fireEvent.click(screen.getByRole('button', { name: '重新生成' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1/regenerate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            currentJd: { ...sampleJobDescription.content, summary: '手动调整后的 JD' },
            extraInstruction: '强调 AI 招聘经验',
          }),
        }),
      );
    });
    expect(screen.getByText('company.md')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存修改' })).not.toBeInTheDocument();
  });

  it('uses the logged-in user company profile when publishing a JD', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobDescription: sampleJobDescription }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tasks: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: sampleCompanyProfile }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescription: { ...sampleJobDescription, status: 'ready_to_publish' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescription: { ...sampleJobDescription, status: 'published' },
          task: {
            taskId: 'task-1',
            skillId: 'boss-like-publish-jd',
            status: 'success',
            trace: {
              taskId: 'task-1',
              skillId: 'boss-like-publish-jd',
              status: 'success',
              steps: [],
              createdAt: '2026-07-06T03:00:00.000Z',
            },
          },
        }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    expect(await screen.findByDisplayValue('深海数据')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '远程' })).toBeChecked();
    fireEvent.change(screen.getByLabelText('发布薪资范围'), { target: { value: '30-50K' } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1/publish',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            platform: 'boss-like',
            company: '深海数据',
            salary: '30-50K',
            location: '上海张江、远程',
            keywords: ['TypeScript', 'React'],
          }),
        }),
      );
    });
  });

  it('keeps the generic publish action enabled for ready-to-publish JD detail', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescription: {
            ...sampleJobDescription,
            salaryRange: null,
            workLocations: [],
            status: 'ready_to_publish',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tasks: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: sampleCompanyProfile }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    const publishButton = await screen.findByRole('button', { name: '发布' });
    expect(publishButton).toBeEnabled();
  });

  it('renders published JD detail as read-only with primary actions at the top', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobDescription: screenedJobDescription }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tasks: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: sampleCompanyProfile }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    const summary = await screen.findByLabelText('岗位摘要');
    expect(summary).toHaveAttribute('readonly');
    expect(screen.getByLabelText('JD 标题')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('发布状态')).toBeDisabled();

    const topActions = screen.getByLabelText('JD 详情主操作');
    expect(within(topActions).getByRole('button', { name: '继续筛选' })).toBeInTheDocument();
    expect(
      within(topActions).queryByRole('link', { name: /已筛选候选人/ }),
    ).not.toBeInTheDocument();
    expect(within(topActions).queryByRole('link', { name: '筛选记录' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /已筛选候选人/ })).toHaveAttribute(
      'href',
      '/jd-generator/jd-1/candidates',
    );
    expect(screen.getByRole('link', { name: '筛选记录' })).toHaveAttribute(
      'href',
      '/jd-generator/jd-1/screening-runs/run-1',
    );
    expect(within(topActions).queryByRole('button', { name: '批量沟通' })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: '保存修改' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发布到 Boss-like' })).not.toBeInTheDocument();
  });

  it('shows global batch communication on the JD workbench header', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ jobDescriptions: [], total: 0 }),
    });

    render(<JDListView />);

    expect(await screen.findByRole('button', { name: '批量沟通' })).toBeInTheDocument();
  });
});
