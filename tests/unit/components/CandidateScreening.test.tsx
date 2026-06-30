import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { JDDetailView, JDListView } from '@/components/jd-generator/jd-pages';
import { CandidateList } from '@/components/candidate-screening/candidate-list';
import { CandidateDetail } from '@/components/candidate-screening/candidate-detail';
import { CandidateTrackingDashboard } from '@/components/candidate-screening/tracking-dashboard';
import type {
  CandidateDto,
  CandidateResumeDto,
  CandidateScreeningDetailDto,
  CandidateScreeningResultListItem,
  CandidateScreeningRunDto,
  CandidateTrackingOverviewDto,
} from '@/lib/candidate-screening/repo';
import type { JD, JobDescriptionDto } from '@/types';

const fetchJobDescriptionsMock = jest.fn();
const fetchJobDescriptionMock = jest.fn();
const fetchJobDescriptionPublishTasksMock = jest.fn();
const updateJobDescriptionResourceMock = jest.fn();
const regenerateJobDescriptionMock = jest.fn();
const publishJobDescriptionResourceMock = jest.fn();
const createCandidateScreeningRunMock = jest.fn();
const fetchJdCandidatesMock = jest.fn();
const fetchJdCandidateDetailMock = jest.fn();
const fetchCandidateTrackingOverviewMock = jest.fn();
const updateJdCandidateProgressMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('@/lib/jd/client', () => ({
  createJobDescriptionFromInput: jest.fn(),
  fetchJobDescription: (...args: unknown[]) => fetchJobDescriptionMock(...args),
  fetchJobDescriptionPublishTasks: (...args: unknown[]) =>
    fetchJobDescriptionPublishTasksMock(...args),
  fetchJobDescriptions: (...args: unknown[]) => fetchJobDescriptionsMock(...args),
  publishJobDescriptionResource: (...args: unknown[]) => publishJobDescriptionResourceMock(...args),
  regenerateJobDescription: (...args: unknown[]) => regenerateJobDescriptionMock(...args),
  updateJobDescriptionResource: (...args: unknown[]) => updateJobDescriptionResourceMock(...args),
}));

jest.mock('@/lib/candidate-screening/client', () => ({
  createCandidateScreeningRun: (...args: unknown[]) => createCandidateScreeningRunMock(...args),
  fetchCandidateTrackingOverview: (...args: unknown[]) =>
    fetchCandidateTrackingOverviewMock(...args),
  fetchJdCandidates: (...args: unknown[]) => fetchJdCandidatesMock(...args),
  fetchJdCandidateDetail: (...args: unknown[]) => fetchJdCandidateDetailMock(...args),
  updateJdCandidateProgress: (...args: unknown[]) => updateJdCandidateProgressMock(...args),
}));

jest.mock('@/components/ui', () => ({
  Button: ({
    as: Component = 'button',
    children,
    href,
    isDisabled,
    onClick,
    rel,
    target,
    type = 'button',
  }: {
    as?: React.ElementType;
    children: React.ReactNode;
    href?: string;
    isDisabled?: boolean;
    onClick?: () => void;
    rel?: string;
    target?: string;
    type?: 'button' | 'submit' | 'reset';
  }) => {
    const componentProps =
      Component === 'button'
        ? { disabled: isDisabled, onClick, type }
        : { href, onClick, rel, role: 'button', target };
    return <Component {...componentProps}>{children}</Component>;
  },
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Chip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Input: ({
    'aria-label': ariaLabel,
    label,
    onValueChange,
    placeholder,
    value,
  }: {
    'aria-label'?: string;
    label?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    value?: string | number;
  }) => (
    <input
      aria-label={ariaLabel ?? label}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(event) => onValueChange?.(event.target.value)}
    />
  ),
}));

const now = '2026-06-29T00:00:00.000Z';

const sampleJdContent: JD = {
  title: '高级后端工程师',
  summary: '负责核心系统',
  responsibilities: ['建设 Java 微服务'],
  requirements: ['Java', '分布式系统'],
  bonus: ['招聘系统经验'],
  highlights: ['业务增长快'],
};

const sampleJobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '高级后端工程师',
  positionDescription: '负责 Java 微服务',
  tone: 'tech',
  status: 'published',
  content: sampleJdContent,
  evaluation: null,
  generationMeta: null,
  createdAt: now,
  updatedAt: now,
};

const sampleRun: CandidateScreeningRunDto = {
  id: 'run-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  platform: 'boss-like',
  mode: 'dry_run',
  status: 'pending',
  currentStage: 'planning',
  searchPlan: null,
  evaluationSchema: null,
  stats: null,
  errorMessage: null,
  startedAt: null,
  finishedAt: null,
  createdAt: now,
  updatedAt: now,
};

const sampleCandidate: CandidateDto = {
  id: 'cand-1',
  userId: 'u1',
  displayName: 'Ada Lovelace',
  currentTitle: 'Senior Backend Engineer',
  currentCompany: 'Analytical Engines',
  location: '上海',
  experienceYears: 8,
  sourcePlatform: 'boss-like',
  platformCandidateId: 'boss-cand-1',
  profileUrl: 'https://boss-like.test/employer/resumes/cand-1',
  identityKey: 'Ada Lovelace|Analytical Engines',
  identityHash: 'hash-1',
  lastActiveAt: now,
  contacted: false,
  replied: false,
  lastContactAt: null,
  createdAt: now,
  updatedAt: now,
};

const sampleResume: CandidateResumeDto = {
  id: 'resume-1',
  userId: 'u1',
  candidateId: 'cand-1',
  sourcePlatform: 'boss-like',
  profileUrl: 'https://boss-like.test/employer/resumes/cand-1',
  rawText: 'Java 微服务，分布式系统，招聘 SaaS，8 年后端经验。',
  structuredSummary: { skills: ['Java', '微服务'] },
  resumeHash: 'resume-hash-1',
  fetchedAt: now,
  createdAt: now,
};

const sampleCandidateListItem: CandidateScreeningResultListItem = {
  id: 'result-1',
  userId: 'u1',
  runId: 'run-1',
  jobDescriptionId: 'jd-1',
  candidateId: 'cand-1',
  resumeId: 'resume-1',
  source: 'both',
  tags: {
    skills: ['Java'],
    domainKnowledge: ['招聘 SaaS'],
    generalAbility: ['owner'],
    risk: [],
    activity: ['active'],
    custom: [],
  },
  scoreDetail: {
    skill: 90,
    domain: 82,
    ability: 86,
    risk: 94,
    llmBonus: 4,
    total: 90,
  },
  finalScore: 90,
  rank: 1,
  decisionAction: 'chat',
  decisionPriority: 'high',
  decisionReason: 'Java 微服务和招聘 SaaS 经验匹配',
  actionPlan: {
    action: 'chat',
    priority: 'high',
    message: '你好，想和你聊聊高级后端工程师机会。',
    reason: '高匹配',
  },
  actionStatus: 'planned',
  interviewStage: 'to_contact',
  notes: null,
  createdAt: now,
  updatedAt: now,
  candidate: sampleCandidate,
  resume: sampleResume,
};

const sampleCandidateDetail: CandidateScreeningDetailDto = {
  ...sampleCandidateListItem,
  actionLogs: [
    {
      id: 'action-log-1',
      userId: 'u1',
      runId: 'run-1',
      screeningResultId: 'result-1',
      candidateId: 'cand-1',
      jobDescriptionId: 'jd-1',
      platform: 'boss-like',
      mode: 'dry_run',
      action: 'chat',
      message: '你好，想和你聊聊高级后端工程师机会。',
      status: 'planned',
      idempotencyKey: 'run-1:cand-1:chat',
      browserTrace: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

const sampleTrackingOverview: CandidateTrackingOverviewDto = {
  jobs: [
    {
      jobDescription: {
        id: 'jd-1',
        department: '技术部',
        position: '高级后端工程师',
        status: 'published',
        title: '高级后端工程师',
        updatedAt: now,
      },
      totalCandidates: 2,
      activeCandidates: 1,
      interviewingCandidates: 1,
      skippedCandidates: 1,
      latestCandidateUpdatedAt: now,
    },
  ],
  candidates: [
    {
      ...sampleCandidateListItem,
      jobDescription: {
        id: 'jd-1',
        department: '技术部',
        position: '高级后端工程师',
        status: 'published',
        title: '高级后端工程师',
        updatedAt: now,
      },
      interviewStage: 'interviewing',
      notes: '下周一面',
    },
  ],
};

describe('candidate screening UI', () => {
  beforeEach(() => {
    fetchJobDescriptionsMock.mockReset();
    fetchJobDescriptionMock.mockReset();
    fetchJobDescriptionPublishTasksMock.mockReset();
    updateJobDescriptionResourceMock.mockReset();
    regenerateJobDescriptionMock.mockReset();
    publishJobDescriptionResourceMock.mockReset();
    createCandidateScreeningRunMock.mockReset();
    fetchJdCandidatesMock.mockReset();
    fetchJdCandidateDetailMock.mockReset();
    fetchCandidateTrackingOverviewMock.mockReset();
    updateJdCandidateProgressMock.mockReset();
    fetchJobDescriptionsMock.mockResolvedValue([sampleJobDescription]);
    fetchJobDescriptionMock.mockResolvedValue(sampleJobDescription);
    fetchJobDescriptionPublishTasksMock.mockResolvedValue([]);
    createCandidateScreeningRunMock.mockResolvedValue(sampleRun);
    fetchJdCandidatesMock.mockResolvedValue([sampleCandidateListItem]);
    fetchJdCandidateDetailMock.mockResolvedValue(sampleCandidateDetail);
    fetchCandidateTrackingOverviewMock.mockResolvedValue(sampleTrackingOverview);
    updateJdCandidateProgressMock.mockResolvedValue({
      ...sampleCandidateListItem,
      interviewStage: 'phone_screen',
      notes: '已约电话',
    });
  });

  it('JD detail shows screening button and screened candidates link when published', async () => {
    render(<JDDetailView jobDescriptionId="jd-1" />);

    expect(await screen.findByRole('button', { name: '筛选候选人' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /已筛选候选人/ })).toHaveAttribute(
      'href',
      '/jd-generator/jd-1/candidates',
    );
  });

  it('JD list links to the cross-JD candidate tracking dashboard', async () => {
    render(<JDListView />);

    const trackingLink = await screen.findByRole('button', { name: '候选人跟踪' });

    expect(trackingLink).toHaveAttribute('href', '/jd-generator/candidates');
  });

  it('starts a dry-run screening run and shows the run id', async () => {
    render(<JDDetailView jobDescriptionId="jd-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '筛选候选人' }));

    await waitFor(() =>
      expect(createCandidateScreeningRunMock).toHaveBeenCalledWith('jd-1', {
        platform: 'boss-like',
      }),
    );
    expect(await screen.findByText(/run-1/)).toBeInTheDocument();
  });

  it('candidate list renders score, decision, source, action status, and interview stage', async () => {
    render(<CandidateList jobDescriptionId="jd-1" />);

    const row = await screen.findByRole('link', { name: /Ada Lovelace/ });
    expect(row).toHaveAttribute('href', '/jd-generator/jd-1/candidates/cand-1');
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getAllByText('chat').length).toBeGreaterThan(0);
    expect(screen.getAllByText('both').length).toBeGreaterThan(0);
    expect(screen.getByText('planned')).toBeInTheDocument();
    expect(screen.getAllByText('to_contact').length).toBeGreaterThan(0);
  });

  it('candidate tracking dashboard shows JD summaries and linked candidates', async () => {
    render(<CandidateTrackingDashboard />);

    expect(await screen.findByText('候选人跟踪')).toBeInTheDocument();
    expect(screen.getByText('1 个跟进中')).toBeInTheDocument();
    expect(screen.getByText('1 个面试中')).toBeInTheDocument();
    expect(screen.getByText('下周一面')).toBeInTheDocument();

    const candidateLink = screen.getByRole('link', { name: /Ada Lovelace/ });
    expect(candidateLink).toHaveAttribute('href', '/jd-generator/jd-1/candidates/cand-1');
    expect(screen.getByRole('button', { name: '查看原站' })).toHaveAttribute(
      'href',
      '/api/jd/jd-1/candidates/cand-1/original-profile',
    );
  });

  it('candidate detail renders resume text and score reason', async () => {
    render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/Java 微服务，分布式系统/)).toBeInTheDocument();
    expect(screen.getByText('Java 微服务和招聘 SaaS 经验匹配')).toBeInTheDocument();
  });

  it('candidate detail links to the original recruiting site profile', async () => {
    render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    const originalProfileLink = await screen.findByRole('button', { name: '查看原站' });

    expect(originalProfileLink).toHaveAttribute(
      'href',
      '/api/jd/jd-1/candidates/cand-1/original-profile',
    );
    expect(originalProfileLink).toHaveAttribute('target', '_blank');
    expect(originalProfileLink).toHaveAttribute('rel', 'noreferrer');
  });

  it('candidate detail updates interview stage', async () => {
    render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    const stageSelect = await screen.findByLabelText('面试阶段');
    fireEvent.change(stageSelect, { target: { value: 'phone_screen' } });
    fireEvent.change(screen.getByLabelText('候选人备注'), { target: { value: '已约电话' } });
    fireEvent.click(screen.getByRole('button', { name: '保存进度' }));

    await waitFor(() =>
      expect(updateJdCandidateProgressMock).toHaveBeenCalledWith('jd-1', 'cand-1', {
        interviewStage: 'phone_screen',
        notes: '已约电话',
      }),
    );

    const progressRegion = screen.getByLabelText('当前候选人进度');
    expect(within(progressRegion).getByText('phone_screen')).toBeInTheDocument();
  });
});
