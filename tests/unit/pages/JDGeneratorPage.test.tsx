import type { ElementType, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { JDCreateView, JDDetailView, JDListView } from '@/components/jd-generator/jd-pages';
import type { JobDescriptionDto } from '@/types';

const pushMock = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
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
  Modal: ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
  ModalBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ModalHeader: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
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
  hiringTarget: null,
  onboardedCount: 0,
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
  hiringTarget: 3,
  onboardedCount: 2,
  screeningSummary: {
    status: 'screened',
    totalCandidateCount: 3,
    qualifiedCandidateCount: 2,
    latestRunId: 'run-1',
    latestRunStatus: 'success',
    latestRunUpdatedAt: '2026-07-06T03:00:00.000Z',
  },
};

const sampleScreeningRun = {
  id: 'run-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  platform: 'boss-like',
  mode: 'execution',
  status: 'success',
  currentStage: 'finalizing',
  skillId: 'screen-candidates-v6',
  workflow: { name: 'screen_candidates', version: 6 },
  currentWorkflowStep: null,
  searchPlan: null,
  evaluationSchema: null,
  stats: null,
  errorMessage: null,
  startedAt: '2026-07-06T02:00:00.000Z',
  finishedAt: '2026-07-06T03:00:00.000Z',
  createdAt: '2026-07-06T02:00:00.000Z',
  updatedAt: '2026-07-06T03:00:00.000Z',
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

function parsedHref(href: string) {
  return new URL(href, 'http://localhost');
}

function expectReturnContext(href: string, returnTo: string, returnLabel: string) {
  const url = parsedHref(href);
  expect(url.searchParams.get('returnTo')).toBe(returnTo);
  expect(url.searchParams.get('returnLabel')).toBe(returnLabel);
}

describe('JD pages', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    pushMock.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ runs: [] }),
    });
  });

  it('renders the JD list with all statuses by default and a Chinese status filter', async () => {
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
        json: async () => ({ runs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescriptions: [{ ...sampleJobDescription, status: 'created' }],
          total: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: [] }),
      });

    render(<JDListView />);

    expect(await screen.findAllByText('前端工程师')).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledWith('/api/jd');
    expect(screen.getAllByText('招聘中').length).toBeGreaterThan(0);
    expect(screen.getByText('已筛选')).toBeInTheDocument();
    expect(screen.getByText('合格 2 / 全部 3')).toBeInTheDocument();
    expect(screen.getByText('已入职 2 / 目标 3')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('JD 状态筛选')).getAllByRole('option')[0],
    ).toHaveTextContent('全部状态');
    expect(screen.getByRole('option', { name: '全部状态' })).toHaveValue('all');
    expect(screen.getByRole('option', { name: '招聘中' })).toHaveValue('published');
    expect(screen.getByRole('option', { name: '已招满' })).toHaveValue('filled');
    expect(screen.getByRole('option', { name: '已停止招聘（系统内）' })).toHaveValue('offline');
    expect(screen.getByRole('link', { name: '新建 JD' })).toHaveAttribute(
      'href',
      '/jd-generator/new',
    );
    const detailHref = screen.getByRole('link', { name: '详情' }).getAttribute('href') ?? '';
    expect(parsedHref(detailHref).pathname).toBe('/jd-generator/jd-1');
    expectReturnContext(detailHref, '/jd-generator', '返回列表');
    expect(screen.getByRole('button', { name: '继续筛选' })).toBeInTheDocument();
    expect(screen.queryByText('本次批量任务平台')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '继续筛选' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('选择筛选平台');
    expect(screen.getByRole('dialog')).toHaveTextContent('本次筛选平台');
    expect(
      (global.fetch as jest.Mock).mock.calls.some(
        ([url, options]) =>
          url === '/api/jd/jd-1/candidate-screening/runs' && options?.method === 'POST',
      ),
    ).toBe(false);
    const screeningRunHref =
      screen.getByRole('link', { name: '筛选记录' }).getAttribute('href') ?? '';
    expect(parsedHref(screeningRunHref).pathname).toBe('/jd-generator/jd-1/screening-runs/run-1');
    expectReturnContext(screeningRunHref, '/jd-generator', '返回列表');
    const candidatesHref = screen.getByRole('link', { name: '候选人' }).getAttribute('href') ?? '';
    expect(parsedHref(candidatesHref).pathname).toBe('/jd-generator/jd-1/candidates');
    expectReturnContext(candidatesHref, '/jd-generator', '返回列表');

    fireEvent.change(screen.getByLabelText('JD 状态筛选'), { target: { value: 'created' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/jd?status=created');
    });
  });

  it.each([
    ['filled', '已招满'],
    ['offline', '已停止招聘（系统内）'],
  ] as const)('keeps detail and candidate links for %s JD rows', async (status, label) => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescriptions: [{ ...screenedJobDescription, status }],
          total: 1,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: sampleCompanyProfile }),
      });

    render(<JDListView />);

    const row = (await screen.findByLabelText('JD 操作')).closest('article');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText(label)).toBeInTheDocument();
    expect(within(row as HTMLElement).getByRole('link', { name: '详情' })).toBeInTheDocument();
    expect(within(row as HTMLElement).getByRole('link', { name: '候选人' })).toHaveAttribute(
      'href',
      expect.stringContaining('/jd-generator/jd-1/candidates'),
    );
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
          run: {
            id: 'create-run-1',
            userId: 'u1',
            jobDescriptionId: null,
            department: '技术部',
            position: '前端工程师',
            positionDescription: '负责增长业务体验建设',
            salaryRange: '30-50K',
            workLocations: ['上海张江', '远程'],
            tone: 'tech',
            status: 'pending',
            currentStage: 'queued',
            errorMessage: null,
            startedAt: null,
            finishedAt: null,
            createdAt: '2026-06-25T01:00:00.000Z',
            updatedAt: '2026-06-25T01:00:00.000Z',
          },
        }),
      });

    render(<JDCreateView />);

    const companyName = await screen.findByLabelText('公司名称');
    await waitFor(() => {
      expect(companyName).toHaveValue('深海数据');
    });
    expect(companyName).toHaveAttribute('readonly');
    expect(screen.getByLabelText('面试流程')).toHaveValue('auto');
    expect(screen.getByText('按部门“技术部”匹配')).toBeInTheDocument();
    expect(screen.getByText(/技术研发类：技术初面/)).toBeInTheDocument();
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
        '/api/jd/create-runs',
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
    expect(pushMock).toHaveBeenCalledWith(
      '/jd-generator/create-runs/create-run-1?returnTo=%2Fjd-generator%2Fnew&returnLabel=%E8%BF%94%E5%9B%9E%E6%96%B0%E5%BB%BA+JD',
    );
  });

  it('starts a regenerate run and navigates to the execution page', async () => {
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
        json: async () => ({ runs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({
          run: {
            id: 'regen-run-1',
            userId: 'u1',
            jobDescriptionId: 'jd-1',
            tone: 'tech',
            extraInstruction: '强调 AI 招聘经验',
            currentJd: { ...sampleJobDescription.content, summary: '手动调整后的 JD' },
            status: 'pending',
            currentStage: 'queued',
            errorMessage: null,
            startedAt: null,
            finishedAt: null,
            createdAt: '2026-07-13T08:00:00.000Z',
            updatedAt: '2026-07-13T08:00:00.000Z',
          },
        }),
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
        '/api/jd/jd-1/regenerate-runs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            currentJd: { ...sampleJobDescription.content, summary: '手动调整后的 JD' },
            extraInstruction: '强调 AI 招聘经验',
          }),
        }),
      );
    });
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/jd-generator\/jd-1\/regenerate-runs\/regen-run-1\?returnTo=.*&returnLabel=.*/,
      ),
    );
    const pushed = String(pushMock.mock.calls.at(-1)?.[0] ?? '');
    expect(parsedHref(pushed).pathname).toBe('/jd-generator/jd-1/regenerate-runs/regen-run-1');
    expectReturnContext(pushed, '/jd-generator/jd-1', '返回 JD');
  });

  it('shows recent regenerate runs with execution page links on the detail sidebar', async () => {
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
          runs: [
            {
              id: 'create-run-1',
              userId: 'u1',
              jobDescriptionId: 'jd-1',
              department: '技术部',
              position: '前端工程师',
              positionDescription: '负责增长业务体验建设',
              salaryRange: '30-50K',
              workLocations: ['上海张江'],
              tone: 'tech',
              status: 'success',
              currentStage: 'completed',
              errorMessage: null,
              startedAt: '2026-07-13T07:00:00.000Z',
              finishedAt: '2026-07-13T07:01:00.000Z',
              createdAt: '2026-07-13T07:00:00.000Z',
              updatedAt: '2026-07-13T07:01:00.000Z',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          runs: [
            {
              id: 'regen-run-2',
              userId: 'u1',
              jobDescriptionId: 'jd-1',
              tone: 'tech',
              extraInstruction: '强调协作',
              currentJd: sampleJobDescription.content,
              status: 'running',
              currentStage: 'llm_generation',
              errorMessage: null,
              startedAt: '2026-07-13T09:00:00.000Z',
              finishedAt: null,
              createdAt: '2026-07-13T09:00:00.000Z',
              updatedAt: '2026-07-13T09:00:30.000Z',
            },
            {
              id: 'regen-run-1',
              userId: 'u1',
              jobDescriptionId: 'jd-1',
              tone: 'tech',
              extraInstruction: '强调 AI',
              currentJd: sampleJobDescription.content,
              status: 'success',
              currentStage: 'completed',
              errorMessage: null,
              startedAt: '2026-07-13T08:00:00.000Z',
              finishedAt: '2026-07-13T08:01:00.000Z',
              createdAt: '2026-07-13T08:00:00.000Z',
              updatedAt: '2026-07-13T08:01:00.000Z',
            },
          ],
        }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    expect(await screen.findByText('重新生成记录')).toBeInTheDocument();
    expect(screen.getByText('创建记录')).toBeInTheDocument();
    expect(screen.getByText('生成中')).toBeInTheDocument();
    expect(screen.getAllByText('已完成').length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/jd/jd-1/regenerate-runs?limit=3');
    });

    const regenLinks = screen.getAllByRole('link', { name: '查看执行页' });
    const regenHrefs = regenLinks
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.includes('/regenerate-runs/'));
    expect(regenHrefs).toHaveLength(2);
    expect(parsedHref(regenHrefs[0]!).pathname).toBe(
      '/jd-generator/jd-1/regenerate-runs/regen-run-2',
    );
    expectReturnContext(regenHrefs[0]!, '/jd-generator/jd-1', '返回 JD');
    expect(parsedHref(regenHrefs[1]!).pathname).toBe(
      '/jd-generator/jd-1/regenerate-runs/regen-run-1',
    );
  });

  it('JD detail returns to the supplied source context', async () => {
    mockSearchParams = new URLSearchParams('returnTo=/&returnLabel=返回工作台');
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
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    expect(await screen.findByRole('link', { name: '返回工作台' })).toHaveAttribute('href', '/');
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
        json: async () => ({ runs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescription: {
            ...sampleJobDescription,
            status: 'ready_to_publish',
            hiringTarget: 4,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run: { id: 'run-1' } }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    expect(await screen.findByDisplayValue('深海数据')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '远程' })).toBeChecked();
    expect(screen.getByLabelText('招聘人数')).toHaveValue(1);
    expect(screen.getByRole('button', { name: '发布' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('发布面试流程'), {
      target: { value: 'default-administration' },
    });
    fireEvent.change(screen.getByLabelText('招聘人数'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('发布薪资范围'), { target: { value: '30-50K' } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            status: 'ready_to_publish',
            hiringTarget: 4,
            salaryRange: '30-50K',
            workLocations: ['上海张江', '远程'],
            content: sampleJobDescription.content,
            interviewProcessId: 'default-administration',
          }),
        }),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/publish-runs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            platform: 'boss-like',
            company: '深海数据',
            salary: '30-50K',
            location: '上海张江、远程',
            keywords: ['TypeScript', 'React'],
            id: 'jd-1',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        expect.stringContaining('/jd-generator/publish-runs/run-1'),
      );
    });
  });

  it('does not publish a stale JD location that is absent from company settings', async () => {
    const staleLocationJob = { ...sampleJobDescription, workLocations: ['上海'] };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobDescription: staleLocationJob }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tasks: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: sampleCompanyProfile }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescription: {
            ...staleLocationJob,
            status: 'ready_to_publish',
            hiringTarget: 1,
            workLocations: ['上海张江'],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ run: { id: 'run-1' } }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    expect(await screen.findByRole('checkbox', { name: '上海张江' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"workLocations":["上海张江"]'),
        }),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/publish-runs',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"location":"上海张江"'),
        }),
      );
    });
  });

  it('defaults the hiring target to one and validates changes before publishing', async () => {
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
        json: async () => ({ runs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: [] }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    const hiringTarget = await screen.findByLabelText('招聘人数');
    expect(hiringTarget).toHaveValue(1);
    expect(screen.getByRole('button', { name: '发布' })).toBeEnabled();
    fireEvent.change(hiringTarget, { target: { value: '1000' } });

    expect(screen.getByText('招聘人数需为 1 到 999 的整数。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布' })).toBeDisabled();
    expect(
      (global.fetch as jest.Mock).mock.calls.some(
        ([url, options]) => url === '/api/jd/jd-1' && options?.method === 'PATCH',
      ),
    ).toBe(false);
  });

  it('requires the publish target to exceed the current onboarded count', async () => {
    const historicalDraft = {
      ...sampleJobDescription,
      status: 'ready_to_publish' as const,
      onboardedCount: 2,
    };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobDescription: historicalDraft }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tasks: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: sampleCompanyProfile }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    const hiringTarget = await screen.findByLabelText('招聘人数');
    fireEvent.change(hiringTarget, { target: { value: '2' } });

    expect(screen.getByText('计划招聘人数必须大于已入职人数（2 人）。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布' })).toBeDisabled();
    expect(hiringTarget).toHaveAttribute('aria-invalid', 'true');
  });

  it('refreshes the JD after a publish conflict changes its status to filled', async () => {
    const readyJob = {
      ...sampleJobDescription,
      status: 'ready_to_publish' as const,
      hiringTarget: null,
      onboardedCount: 0,
    };
    const savedJob = { ...readyJob, hiringTarget: 2 };
    const filledJob = {
      ...savedJob,
      status: 'filled' as const,
      onboardedCount: 2,
    };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ jobDescription: readyJob }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tasks: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: sampleCompanyProfile }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ jobDescription: savedJob }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'hiring target has already been reached' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ jobDescription: filledJob }) });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    fireEvent.change(await screen.findByLabelText('招聘人数'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    expect(await screen.findByText('已入职 2 / 目标 2')).toBeInTheDocument();
    expect(screen.getAllByText('已招满').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '发布' })).not.toBeInTheDocument();
  });

  it('lets a published historical JD set a missing hiring target', async () => {
    const historicalJob = {
      ...screenedJobDescription,
      hiringTarget: null,
      onboardedCount: 1,
    };
    const updatedJob = { ...historicalJob, hiringTarget: 3 };
    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (url === '/api/jd/jd-1/lifecycle' && options?.method === 'POST') {
          return { ok: true, json: async () => ({ jobDescription: updatedJob }) };
        }
        if (url === '/api/jd/jd-1') {
          return { ok: true, json: async () => ({ jobDescription: historicalJob }) };
        }
        if (url === '/api/company-profile') {
          return { ok: true, json: async () => ({ profile: sampleCompanyProfile }) };
        }
        if (url === '/api/jd/jd-1/publish') {
          return { ok: true, json: async () => ({ tasks: [] }) };
        }
        return { ok: true, json: async () => ({ runs: [] }) };
      },
    );

    render(<JDDetailView jobDescriptionId="jd-1" />);

    expect(await screen.findByText('已入职 1 / 目标未设置')).toBeInTheDocument();
    expect(screen.getByLabelText('招聘人数')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('招聘人数'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '设置招聘人数' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1/lifecycle',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'set_hiring_target', hiringTarget: 3 }),
        }),
      );
    });
    expect(await screen.findByText('已入职 1 / 目标 3')).toBeInTheDocument();
  });

  it('lets a published JD adjust its configured hiring target', async () => {
    const updatedJob = { ...screenedJobDescription, hiringTarget: 4 };
    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (url === '/api/jd/jd-1/lifecycle' && options?.method === 'POST') {
          return { ok: true, json: async () => ({ jobDescription: updatedJob }) };
        }
        if (url === '/api/jd/jd-1') {
          return { ok: true, json: async () => ({ jobDescription: screenedJobDescription }) };
        }
        if (url === '/api/company-profile') {
          return { ok: true, json: async () => ({ profile: sampleCompanyProfile }) };
        }
        if (url === '/api/jd/jd-1/publish') {
          return { ok: true, json: async () => ({ tasks: [] }) };
        }
        return { ok: true, json: async () => ({ runs: [] }) };
      },
    );

    render(<JDDetailView jobDescriptionId="jd-1" />);

    const hiringTarget = await screen.findByLabelText('招聘人数');
    expect(hiringTarget).toHaveValue(3);
    expect(hiringTarget).not.toHaveAttribute('readonly');
    fireEvent.change(hiringTarget, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '保存招聘人数' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1/lifecycle',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'set_hiring_target', hiringTarget: 4 }),
        }),
      );
    });
  });

  it('takes a published JD offline', async () => {
    const updatedJob = { ...screenedJobDescription, status: 'offline' as const };
    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (url === '/api/jd/jd-1/lifecycle' && options?.method === 'POST') {
          return { ok: true, json: async () => ({ jobDescription: updatedJob }) };
        }
        if (url === '/api/jd/jd-1') {
          return { ok: true, json: async () => ({ jobDescription: screenedJobDescription }) };
        }
        if (url === '/api/company-profile') {
          return { ok: true, json: async () => ({ profile: sampleCompanyProfile }) };
        }
        if (url === '/api/jd/jd-1/publish') {
          return { ok: true, json: async () => ({ tasks: [] }) };
        }
        return { ok: true, json: async () => ({ runs: [] }) };
      },
    );

    render(<JDDetailView jobDescriptionId="jd-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '系统内停止招聘' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1/lifecycle',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'take_offline' }),
        }),
      );
    });
    expect(await screen.findByText('已停止招聘（系统内）')).toBeInTheDocument();
  });

  it('only changes the active lifecycle action label while an update is pending', async () => {
    let resolveLifecycle:
      | ((response: { ok: boolean; json: () => Promise<unknown> }) => void)
      | null = null;
    const lifecycleResponse = new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
      (resolve) => {
        resolveLifecycle = resolve;
      },
    );
    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (url === '/api/jd/jd-1/lifecycle' && options?.method === 'POST') {
          return lifecycleResponse;
        }
        if (url === '/api/jd/jd-1') {
          return { ok: true, json: async () => ({ jobDescription: screenedJobDescription }) };
        }
        if (url === '/api/company-profile') {
          return { ok: true, json: async () => ({ profile: sampleCompanyProfile }) };
        }
        if (url === '/api/jd/jd-1/publish') {
          return { ok: true, json: async () => ({ tasks: [] }) };
        }
        return { ok: true, json: async () => ({ runs: [] }) };
      },
    );

    render(<JDDetailView jobDescriptionId="jd-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '系统内停止招聘' }));

    expect(await screen.findByRole('button', { name: '处理中' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存招聘人数' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '保存中' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('招聘人数')).toHaveAttribute('readonly');

    resolveLifecycle?.({
      ok: true,
      json: async () => ({
        jobDescription: { ...screenedJobDescription, status: 'offline' },
      }),
    });
    expect(await screen.findByText('已停止招聘（系统内）')).toBeInTheDocument();
  });

  it('requires a filled JD to raise its target before reopening recruitment', async () => {
    const filledJob = {
      ...screenedJobDescription,
      status: 'filled' as const,
      hiringTarget: 2,
      onboardedCount: 2,
    };
    const reopenedJob = { ...filledJob, status: 'published' as const, hiringTarget: 3 };
    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (url === '/api/jd/jd-1/lifecycle' && options?.method === 'POST') {
          return { ok: true, json: async () => ({ jobDescription: reopenedJob }) };
        }
        if (url === '/api/jd/jd-1') {
          return { ok: true, json: async () => ({ jobDescription: filledJob }) };
        }
        if (url === '/api/company-profile') {
          return { ok: true, json: async () => ({ profile: sampleCompanyProfile }) };
        }
        if (url === '/api/jd/jd-1/publish') {
          return { ok: true, json: async () => ({ tasks: [] }) };
        }
        return { ok: true, json: async () => ({ runs: [] }) };
      },
    );

    render(<JDDetailView jobDescriptionId="jd-1" />);

    expect((await screen.findAllByText('已招满')).length).toBeGreaterThan(0);
    expect(screen.getByText('已入职 2 / 目标 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提高人数并在系统内重新开放' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '系统内停止招聘' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '已筛选候选人' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '继续筛选' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('招聘人数'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '提高人数并在系统内重新开放' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1/lifecycle',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'reopen', hiringTarget: 3 }),
        }),
      );
    });
  });

  it('reopens an offline JD when it still has hiring capacity', async () => {
    const offlineJob = {
      ...screenedJobDescription,
      status: 'offline' as const,
      hiringTarget: 3,
      onboardedCount: 1,
    };
    const reopenedJob = { ...offlineJob, status: 'published' as const };
    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (url === '/api/jd/jd-1/lifecycle' && options?.method === 'POST') {
          return { ok: true, json: async () => ({ jobDescription: reopenedJob }) };
        }
        if (url === '/api/jd/jd-1') {
          return { ok: true, json: async () => ({ jobDescription: offlineJob }) };
        }
        if (url === '/api/company-profile') {
          return { ok: true, json: async () => ({ profile: sampleCompanyProfile }) };
        }
        if (url === '/api/jd/jd-1/publish') {
          return { ok: true, json: async () => ({ tasks: [] }) };
        }
        return { ok: true, json: async () => ({ runs: [] }) };
      },
    );

    render(<JDDetailView jobDescriptionId="jd-1" />);

    const reopenButton = await screen.findByRole('button', { name: '系统内重新开放招聘' });
    expect(screen.getByRole('link', { name: '已筛选候选人' })).toBeInTheDocument();
    fireEvent.click(reopenButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1/lifecycle',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'reopen' }),
        }),
      );
    });
  });

  it('archives an offline JD', async () => {
    const offlineJob = {
      ...screenedJobDescription,
      status: 'offline' as const,
      hiringTarget: 3,
      onboardedCount: 1,
    };
    const archivedJob = { ...offlineJob, status: 'archived' as const };
    (global.fetch as jest.Mock).mockImplementation(
      async (url: string, options?: { method?: string }) => {
        if (url === '/api/jd/jd-1/lifecycle' && options?.method === 'POST') {
          return { ok: true, json: async () => ({ jobDescription: archivedJob }) };
        }
        if (url === '/api/jd/jd-1') {
          return { ok: true, json: async () => ({ jobDescription: offlineJob }) };
        }
        if (url === '/api/company-profile') {
          return { ok: true, json: async () => ({ profile: sampleCompanyProfile }) };
        }
        if (url === '/api/jd/jd-1/publish') {
          return { ok: true, json: async () => ({ tasks: [] }) };
        }
        return { ok: true, json: async () => ({ runs: [] }) };
      },
    );

    render(<JDDetailView jobDescriptionId="jd-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '归档 JD' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1/lifecycle',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'archive' }),
        }),
      );
    });
    expect(await screen.findByText('已归档')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '归档 JD' })).not.toBeInTheDocument();
  });

  it.each(['publishing', 'archived'] as const)(
    'does not show a publish action for %s JD details',
    async (nonEditableStatus) => {
      const nonEditableJob = { ...sampleJobDescription, status: nonEditableStatus };
      (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
        if (url === '/api/jd/jd-1') {
          return { ok: true, json: async () => ({ jobDescription: nonEditableJob }) };
        }
        if (url === '/api/company-profile') {
          return { ok: true, json: async () => ({ profile: sampleCompanyProfile }) };
        }
        if (url === '/api/jd/jd-1/publish') {
          return { ok: true, json: async () => ({ tasks: [] }) };
        }
        return { ok: true, json: async () => ({ runs: [] }) };
      });

      render(<JDDetailView jobDescriptionId="jd-1" />);

      expect(await screen.findByLabelText('岗位摘要')).toHaveAttribute('readonly');
      expect(screen.queryByRole('button', { name: '发布' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('发布状态')).toBeDisabled();
      expect(screen.getByLabelText('招聘人数')).toHaveValue(null);
      expect(screen.getByLabelText('招聘人数')).toHaveAttribute('readonly');
    },
  );

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
            hiringTarget: 1,
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: [] }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    const publishButton = await screen.findByRole('button', { name: '发布' });
    expect(publishButton).toBeEnabled();
    expect(screen.getByLabelText('发布状态')).toBeDisabled();
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ runs: [sampleScreeningRun] }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    const summary = await screen.findByLabelText('岗位摘要');
    expect(summary).toHaveAttribute('readonly');
    expect(screen.getByLabelText('JD 标题')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('发布状态')).toBeDisabled();

    const topActions = screen.getByLabelText('JD 详情主操作');
    expect(within(topActions).getByRole('button', { name: '继续筛选' })).toBeInTheDocument();
    const candidatesLink = within(topActions).getByRole('link', { name: '已筛选候选人' });
    expect(parsedHref(candidatesLink.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-1/candidates',
    );
    expectReturnContext(candidatesLink.getAttribute('href') ?? '', '/jd-generator/jd-1', '返回 JD');
    expect(within(topActions).queryByRole('link', { name: '筛选记录' })).not.toBeInTheDocument();
    expect(within(topActions).queryByRole('button', { name: '批量沟通' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /查看执行日志/ })).not.toBeInTheDocument();
    expect(screen.queryByText('筛选历史')).not.toBeInTheDocument();

    expect(screen.getByText('本次发布平台')).toBeInTheDocument();
    expect(screen.getByText('本次筛选平台')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: '保存修改' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发布到 Boss-like' })).not.toBeInTheDocument();
  });

  it('shows the platforms from the latest successful publish batch after publishing', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobDescription: screenedJobDescription }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tasks: [
            {
              id: 'task-1',
              userId: 'u1',
              jobDescriptionId: 'jd-1',
              batchId: 'batch-1',
              skillId: 'boss-like-publish-jd-v1',
              platform: 'boss-like',
              input: {},
              currentStep: null,
              status: 'success',
              errorMessage: null,
              trace: null,
              createdAt: '2026-07-22T02:00:00.000Z',
              updatedAt: '2026-07-22T02:01:00.000Z',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          profile: {
            ...sampleCompanyProfile,
            supportedPlatforms: ['zhilian', 'boss-like'],
          },
          platforms: [
            {
              id: 'zhilian',
              label: '智联招聘',
              shortLabel: '智联招聘',
              description: '智联招聘企业端',
              kind: 'production',
              defaultBaseUrl: 'https://zhilian.example',
              defaultVariables: {},
            },
            {
              id: 'boss-like',
              label: 'BOSS-like（本地）',
              shortLabel: 'BOSS-like',
              description: '本地招聘站点',
              kind: 'local',
              defaultBaseUrl: 'http://localhost:6183',
              defaultVariables: {},
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    await screen.findByText('本次发布平台');
    const publishPlatformGroup = within(
      screen.getAllByRole('group', { name: '本次发布平台' }).at(-1)!,
    );
    const zhilian = publishPlatformGroup.getByRole('checkbox', { name: /智联招聘/ });
    const bossLike = publishPlatformGroup.getByRole('checkbox', { name: /BOSS-like/ });
    expect(zhilian).not.toBeChecked();
    expect(bossLike).toBeChecked();
    expect(zhilian).toBeDisabled();
    expect(bossLike).toBeDisabled();

    const screeningPlatformGroup = within(
      screen.getAllByRole('group', { name: '本次筛选平台' }).at(-1)!,
    );
    expect(screeningPlatformGroup.getByRole('checkbox', { name: /智联招聘/ })).not.toBeChecked();
    expect(screeningPlatformGroup.getByRole('checkbox', { name: /BOSS-like/ })).toBeChecked();
  });

  it('keeps the failed platform selected for a retry', async () => {
    const failedJob = {
      ...sampleJobDescription,
      status: 'publish_failed' as const,
      hiringTarget: 1,
    };
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url === '/api/jd/jd-1') {
        return { ok: true, json: async () => ({ jobDescription: failedJob }) };
      }
      if (url === '/api/jd/jd-1/publish') {
        return {
          ok: true,
          json: async () => ({
            tasks: [],
            runs: [
              {
                id: 'run-1',
                batchId: 'batch-1',
                platform: 'boss',
                status: 'failed',
              },
            ],
          }),
        };
      }
      if (url === '/api/company-profile') {
        return {
          ok: true,
          json: async () => ({
            profile: { ...sampleCompanyProfile, supportedPlatforms: ['boss-like'] },
            platforms: [
              {
                id: 'boss',
                label: 'BOSS 直聘',
                shortLabel: 'BOSS 直聘',
                description: 'BOSS 直聘企业端',
                kind: 'production',
                defaultBaseUrl: 'https://www.zhipin.com',
                defaultVariables: {},
              },
              {
                id: 'boss-like',
                label: 'BOSS-like（本地）',
                shortLabel: 'BOSS-like',
                description: '本地招聘站点',
                kind: 'local',
                defaultBaseUrl: 'http://localhost:6183',
                defaultVariables: {},
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ runs: [] }) };
    });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    await screen.findByText('本次发布平台');
    const publishPlatformGroup = within(
      screen.getAllByRole('group', { name: '本次发布平台' }).at(-1)!,
    );
    expect(publishPlatformGroup.getByRole('checkbox', { name: /BOSS 直聘/ })).toBeChecked();
    expect(publishPlatformGroup.getByRole('checkbox', { name: /BOSS-like/ })).not.toBeChecked();
  });

  it('blocks further screening for a legacy published JD until its hiring target is set', async () => {
    const legacyPublishedJob = {
      ...screenedJobDescription,
      hiringTarget: null,
      onboardedCount: 0,
    };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobDescription: legacyPublishedJob }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tasks: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: sampleCompanyProfile }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [] }) });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    expect(
      await screen.findByText(/设置完成前不能继续筛选候选人，也无法在入职达标时自动标记招满/),
    ).toBeInTheDocument();
    const topActions = screen.getByLabelText('JD 详情主操作');
    expect(within(topActions).queryByRole('button', { name: /筛选/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置招聘人数' })).toBeInTheDocument();
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
