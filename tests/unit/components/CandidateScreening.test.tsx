import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { JDDetailView, JDListView } from '@/components/jd-generator/jd-pages';
import { CandidateList } from '@/components/candidate-screening/candidate-list';
import { InterviewRecordList } from '@/components/candidate-screening/interview-record-list';
import { ResumeLibrary } from '@/components/candidate-screening/resume-library';
import { CandidateCommunicationRunLog } from '@/components/candidate-communication/communication-run-log';
import { CandidateDetail } from '@/components/candidate-screening/candidate-detail';
import { CandidateScreeningRunLog } from '@/components/candidate-screening/screening-run-log';
import { CandidateTrackingDashboard } from '@/components/candidate-screening/tracking-dashboard';
import type {
  CandidateDto,
  CandidateInterviewFeedbackDto,
  CandidateInterviewRecordDto,
  CandidateDecisionResultDto,
  CandidateResumeLibraryItemDto,
  CandidateResumeDto,
  CandidateScreeningDetailDto,
  CandidateScreeningResultListItem,
  CandidateScreeningRunEventDto,
  CandidateScreeningRunDto,
  CandidateTrackingOverviewDto,
} from '@/lib/candidate-screening/repo';
import type { JD, JobDescriptionDto } from '@/types';

const fetchJobDescriptionsMock = jest.fn();
const fetchJobDescriptionMock = jest.fn();
const fetchJobDescriptionPublishTasksMock = jest.fn();
const fetchJobDescriptionCreateRunsMock = jest.fn();
const updateJobDescriptionResourceMock = jest.fn();
const regenerateJobDescriptionMock = jest.fn();
const publishJobDescriptionResourceMock = jest.fn();
const createCandidateScreeningRunMock = jest.fn();
const fetchCandidateScreeningRunMock = jest.fn();
const fetchCandidateScreeningRunWithEventsMock = jest.fn();
const fetchJdCandidatesMock = jest.fn();
const fetchJdCandidateDetailMock = jest.fn();
const fetchCandidateTrackingOverviewMock = jest.fn();
const fetchCandidateResumeLibraryMock = jest.fn();
const fetchCandidateInterviewRecordsMock = jest.fn();
const updateJdCandidateProgressMock = jest.fn();
const fetchCandidateInterviewFeedbacksMock = jest.fn();
const saveCandidateInterviewFeedbackMock = jest.fn();
const evaluateJdCandidateDecisionMock = jest.fn();
const startCandidateCommunicationRunMock = jest.fn();
const fetchCandidateCommunicationRunMock = jest.fn();
const routerPushMock = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, refresh: jest.fn() }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/lib/jd/client', () => ({
  createJobDescriptionFromInput: jest.fn(),
  fetchJobDescription: (...args: unknown[]) => fetchJobDescriptionMock(...args),
  fetchJobDescriptionCreateRuns: (...args: unknown[]) => fetchJobDescriptionCreateRunsMock(...args),
  fetchJobDescriptionPublishTasks: (...args: unknown[]) =>
    fetchJobDescriptionPublishTasksMock(...args),
  fetchJobDescriptions: (...args: unknown[]) => fetchJobDescriptionsMock(...args),
  publishJobDescriptionResource: (...args: unknown[]) => publishJobDescriptionResourceMock(...args),
  regenerateJobDescription: (...args: unknown[]) => regenerateJobDescriptionMock(...args),
  updateJobDescriptionResource: (...args: unknown[]) => updateJobDescriptionResourceMock(...args),
}));

jest.mock('@/lib/candidate-screening/client', () => ({
  createCandidateScreeningRun: (...args: unknown[]) => createCandidateScreeningRunMock(...args),
  fetchCandidateScreeningRun: (...args: unknown[]) => fetchCandidateScreeningRunMock(...args),
  fetchCandidateScreeningRunWithEvents: (...args: unknown[]) =>
    fetchCandidateScreeningRunWithEventsMock(...args),
  fetchCandidateTrackingOverview: (...args: unknown[]) =>
    fetchCandidateTrackingOverviewMock(...args),
  fetchCandidateResumeLibrary: (...args: unknown[]) => fetchCandidateResumeLibraryMock(...args),
  fetchCandidateInterviewRecords: (...args: unknown[]) =>
    fetchCandidateInterviewRecordsMock(...args),
  fetchJdCandidates: (...args: unknown[]) => fetchJdCandidatesMock(...args),
  fetchJdCandidateDetail: (...args: unknown[]) => fetchJdCandidateDetailMock(...args),
  fetchCandidateInterviewFeedbacks: (...args: unknown[]) =>
    fetchCandidateInterviewFeedbacksMock(...args),
  saveCandidateInterviewFeedback: (...args: unknown[]) =>
    saveCandidateInterviewFeedbackMock(...args),
  evaluateJdCandidateDecision: (...args: unknown[]) => evaluateJdCandidateDecisionMock(...args),
  updateJdCandidateProgress: (...args: unknown[]) => updateJdCandidateProgressMock(...args),
}));

jest.mock('@/lib/candidate-communication/client', () => ({
  startCandidateCommunicationRun: (...args: unknown[]) =>
    startCandidateCommunicationRunMock(...args),
  fetchCandidateCommunicationRun: (...args: unknown[]) =>
    fetchCandidateCommunicationRunMock(...args),
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

function parsedHref(href: string) {
  return new URL(href, 'http://localhost');
}

function expectReturnContext(href: string, returnTo: string, returnLabel: string) {
  const url = parsedHref(href);
  expect(url.searchParams.get('returnTo')).toBe(returnTo);
  expect(url.searchParams.get('returnLabel')).toBe(returnLabel);
}

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
  mode: 'execution',
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

const sampleRunEvents: CandidateScreeningRunEventDto[] = [
  {
    id: 'event-plan',
    userId: 'u1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    candidateId: null,
    stage: 'planning',
    level: 'info',
    message: '生成搜索计划',
    detail: {
      keywords: ['Java', '招聘 SaaS'],
      retrievalQuery: 'Java 微服务 招聘 SaaS',
      filters: { experience: '5年以上', location: '上海' },
    },
    createdAt: now,
  },
  {
    id: 'event-eval',
    userId: 'u1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    candidateId: 'cand-1',
    stage: 'evaluating',
    level: 'success',
    message: '完成评估：Ada Lovelace',
    detail: {
      candidateName: 'Ada Lovelace',
      scoreDetail: {
        skill: 90,
        domain: 82,
        ability: 86,
        risk: 94,
        llmBonus: 4,
        total: 90,
      },
      decision: {
        action: 'chat',
        priority: 'high',
        reason: 'Java 微服务和招聘 SaaS 经验匹配',
      },
    },
    createdAt: now,
  },
  {
    id: 'event-pool',
    userId: 'u1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    candidateId: null,
    stage: 'evaluating',
    level: 'info',
    message: '合并候选池：准备评估 2 人',
    detail: {
      selectedCandidates: [
        {
          candidateName: 'Vector Recall Candidate',
          source: 'vector_recall',
          matchScore: 0.98,
        },
        {
          candidateName: 'Live Search Candidate',
          source: 'live_search',
          matchScore: 1,
        },
      ],
    },
    createdAt: now,
  },
  {
    id: 'event-ranking',
    userId: 'u1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    candidateId: null,
    stage: 'ranking',
    level: 'success',
    message: '排序完成：2 人',
    detail: {
      candidates: [
        {
          candidateName: 'Ada Lovelace',
          rank: 1,
          source: 'both',
          finalScore: 90,
          matchScore: 1,
        },
        {
          candidateName: 'Grace Hopper',
          rank: 2,
          source: 'vector_recall',
          finalScore: 89,
          matchScore: 0.82,
        },
      ],
    },
    createdAt: now,
  },
  {
    id: 'event-action',
    userId: 'u1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    candidateId: 'cand-1',
    stage: 'executing_actions',
    level: 'info',
    message: '执行动作：Ada Lovelace',
    detail: {
      candidateName: 'Ada Lovelace',
      action: 'chat',
      priority: 'high',
      actionMessage: '你好 Ada，我们正在招聘高级后端工程师，想进一步沟通一下。',
    },
    createdAt: now,
  },
  {
    id: 'event-dedupe',
    userId: 'u1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    candidateId: null,
    stage: 'indexing_resumes',
    level: 'warning',
    message: '跳过重复候选人：Ada Again',
    detail: {
      candidateName: 'Ada Again',
      dedupeBy: 'raw_identity',
      duplicateOf: {
        candidateName: 'Ada One',
        candidateId: 'cand-previous',
        resumeId: 'resume-previous',
        profileUrl: 'https://boss-like.test/employer/resumes/ada-one',
      },
    },
    createdAt: now,
  },
  {
    id: 'event-reuse',
    userId: 'u1',
    runId: 'run-1',
    jobDescriptionId: 'jd-1',
    candidateId: 'cand-2',
    stage: 'evaluating',
    level: 'info',
    message: '复用历史评估：Grace Hopper',
    detail: {
      candidateName: 'Grace Hopper',
      previousRunId: 'previous-run',
      resultId: 'result-history',
      reusedEvaluation: true,
      scoreDetail: {
        skill: 88,
        domain: 84,
        ability: 86,
        risk: 92,
        llmBonus: 3,
        total: 89,
      },
      decision: {
        action: 'collect',
        priority: 'medium',
        reason: '历史评分已确认匹配',
      },
    },
    createdAt: now,
  },
];

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

const sampleResumeLibraryItem: CandidateResumeLibraryItemDto = {
  resume: sampleResume,
  candidate: sampleCandidate,
  mountedJobs: [
    {
      screeningResultId: 'result-1',
      candidateId: 'cand-1',
      resumeId: 'resume-1',
      finalScore: 89,
      interviewStage: 'to_contact',
      decisionAction: 'chat',
      updatedAt: now,
      jobDescription: {
        id: 'jd-1',
        department: 'Engineering',
        position: 'Frontend Engineer',
        status: 'published',
        title: 'Frontend Engineer',
        updatedAt: now,
      },
    },
  ],
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

const sampleFeedback: CandidateInterviewFeedbackDto = {
  id: 'feedback-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  candidateId: 'cand-1',
  stage: 'first_interview',
  interviewer: 'Grace Hopper',
  rating: 4,
  pros: ['Java 基础扎实'],
  cons: ['系统设计还需追问'],
  decision: 'pass',
  notes: '建议推进二面',
  createdAt: now,
  updatedAt: now,
};

const sampleDecisionResult: CandidateDecisionResultDto = {
  hireDecision: 'yes',
  confidence: 0.82,
  offerAcceptProbability: 0.68,
  generatedAt: now,
  features: {
    skillMatchScore: 0.86,
    experienceMatch: 0.9,
    interviewScore: 0.8,
    intentLevel: 'high',
    risks: {
      salarySensitive: true,
      hasOtherOffers: false,
      lowStability: false,
    },
    responsiveness: 0.85,
  },
  riskAnalysis: {
    level: 'medium',
    reasons: ['薪资敏感'],
  },
  strengths: ['Java 基础扎实'],
  weaknesses: ['系统设计还需追问'],
  suggestions: [{ type: 'action', content: '先确认薪资预期再发 offer' }],
};

const sampleCommunicationRun = {
  id: 'comm-run-1',
  userId: 'u1',
  jobDescriptionId: 'jd-1',
  candidateId: null,
  platform: 'boss-like',
  mode: 'batch',
  status: 'success',
  stats: {
    total: 2,
    selected: 2,
    processed: 2,
    failed: 0,
    passes: 3,
    records: [
      {
        candidateId: 'cand-1',
        candidateName: 'Ada Lovelace',
        status: 'success',
        detail: '已处理未读消息',
      },
    ],
  },
  errorMessage: null,
  startedAt: now,
  finishedAt: now,
  createdAt: now,
  updatedAt: now,
  jobDescription: {
    id: 'jd-1',
    department: '技术部',
    position: '高级后端工程师',
    status: 'published',
  },
  candidate: null,
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
    mockSearchParams = new URLSearchParams();
    fetchJobDescriptionsMock.mockReset();
    fetchJobDescriptionMock.mockReset();
    fetchJobDescriptionCreateRunsMock.mockReset();
    fetchJobDescriptionPublishTasksMock.mockReset();
    updateJobDescriptionResourceMock.mockReset();
    regenerateJobDescriptionMock.mockReset();
    publishJobDescriptionResourceMock.mockReset();
    createCandidateScreeningRunMock.mockReset();
    fetchCandidateScreeningRunMock.mockReset();
    fetchCandidateScreeningRunWithEventsMock.mockReset();
    fetchJdCandidatesMock.mockReset();
    fetchJdCandidateDetailMock.mockReset();
    fetchCandidateTrackingOverviewMock.mockReset();
    fetchCandidateResumeLibraryMock.mockReset();
    fetchCandidateInterviewRecordsMock.mockReset();
    updateJdCandidateProgressMock.mockReset();
    fetchCandidateInterviewFeedbacksMock.mockReset();
    saveCandidateInterviewFeedbackMock.mockReset();
    evaluateJdCandidateDecisionMock.mockReset();
    startCandidateCommunicationRunMock.mockReset();
    fetchCandidateCommunicationRunMock.mockReset();
    routerPushMock.mockReset();
    startCandidateCommunicationRunMock.mockResolvedValue(sampleCommunicationRun);
    fetchCandidateCommunicationRunMock.mockResolvedValue(sampleCommunicationRun);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        stoppedReason: 'no_unread_messages',
        processed: 2,
        failed: 0,
        passes: 3,
      }),
    });
    fetchJobDescriptionsMock.mockResolvedValue([sampleJobDescription]);
    fetchJobDescriptionMock.mockResolvedValue(sampleJobDescription);
    fetchJobDescriptionCreateRunsMock.mockResolvedValue([]);
    fetchJobDescriptionPublishTasksMock.mockResolvedValue([]);
    createCandidateScreeningRunMock.mockResolvedValue(sampleRun);
    fetchCandidateScreeningRunMock.mockResolvedValue({
      ...sampleRun,
      status: 'success',
      currentStage: 'finalizing',
      searchPlan: {
        keywords: ['Java', '招聘 SaaS'],
        filters: { experience: '5年以上', location: '上海' },
        priorityTags: ['Java', '微服务'],
        retrievalQuery: 'Java 微服务 招聘 SaaS',
      },
      evaluationSchema: {
        skills: ['Java', '微服务'],
        domainKnowledge: ['招聘 SaaS'],
        generalAbility: ['owner'],
        risk: ['跳槽频繁'],
      },
      stats: {
        fetched: 12,
        deduped: 3,
        stored: 9,
        vectorRecalled: 4,
        evaluated: 9,
        recommendedChat: 1,
        recommendedCollect: 1,
        skipped: 1,
        failed: 0,
      },
    });
    fetchCandidateScreeningRunWithEventsMock.mockResolvedValue({
      run: {
        ...sampleRun,
        status: 'success',
        currentStage: 'finalizing',
        searchPlan: {
          keywords: ['Java', '招聘 SaaS'],
          filters: { experience: '5年以上', location: '上海' },
          priorityTags: ['Java', '微服务'],
          retrievalQuery: 'Java 微服务 招聘 SaaS',
        },
        evaluationSchema: {
          skills: ['Java', '微服务'],
          domainKnowledge: ['招聘 SaaS'],
          generalAbility: ['owner'],
          risk: ['跳槽频繁'],
        },
        stats: {
          fetched: 12,
          deduped: 3,
          stored: 9,
          vectorRecalled: 4,
          evaluated: 9,
          recommendedChat: 1,
          recommendedCollect: 1,
          skipped: 1,
          failed: 0,
        },
      },
      events: sampleRunEvents,
    });
    fetchJdCandidatesMock.mockResolvedValue([sampleCandidateListItem]);
    fetchJdCandidateDetailMock.mockResolvedValue(sampleCandidateDetail);
    fetchCandidateInterviewFeedbacksMock.mockResolvedValue([sampleFeedback]);
    saveCandidateInterviewFeedbackMock.mockResolvedValue(sampleFeedback);
    evaluateJdCandidateDecisionMock.mockResolvedValue(sampleDecisionResult);
    fetchCandidateTrackingOverviewMock.mockResolvedValue(sampleTrackingOverview);
    fetchCandidateResumeLibraryMock.mockResolvedValue([sampleResumeLibraryItem]);
    fetchCandidateInterviewRecordsMock.mockResolvedValue([
      {
        ...sampleFeedback,
        candidate: sampleCandidate,
        jobDescription: {
          id: 'jd-1',
          department: 'Engineering',
          position: 'Frontend Engineer',
          status: 'published',
          title: 'Frontend Engineer',
          updatedAt: now,
        },
      } satisfies CandidateInterviewRecordDto,
    ]);
    updateJdCandidateProgressMock.mockResolvedValue({
      ...sampleCandidateListItem,
      interviewStage: 'phone_screen',
      notes: '已约电话',
    });
  });

  it('JD detail shows screening button and screened candidates link when published', async () => {
    render(<JDDetailView jobDescriptionId="jd-1" />);

    expect(await screen.findByRole('button', { name: '筛选并执行' })).toBeInTheDocument();
    const candidatesLink = screen.getByRole('link', { name: /已筛选候选人/ });
    expect(parsedHref(candidatesLink.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-1/candidates',
    );
    expectReturnContext(candidatesLink.getAttribute('href') ?? '', '/jd-generator/jd-1', '返回 JD');
    expect(screen.queryByRole('button', { name: '批量沟通' })).not.toBeInTheDocument();
  });

  it('JD list links to the cross-JD candidate tracking dashboard', async () => {
    render(<JDListView />);

    const trackingLink = await screen.findByRole('button', { name: '候选人跟踪' });

    expect(parsedHref(trackingLink.getAttribute('href') ?? '').pathname).toBe('/candidates');
    expectReturnContext(trackingLink.getAttribute('href') ?? '', '/jd-generator', '返回 JD 工作台');
  });

  it('JD list renders status-specific actions and starts a new screening run from published rows', async () => {
    fetchJobDescriptionsMock.mockResolvedValueOnce([
      { ...sampleJobDescription, id: 'jd-created', status: 'created' },
      { ...sampleJobDescription, id: 'jd-ready', status: 'ready_to_publish' },
      { ...sampleJobDescription, id: 'jd-publishing', status: 'publishing' },
      {
        ...sampleJobDescription,
        id: 'jd-published',
        status: 'published',
        screeningSummary: {
          status: 'screened',
          totalCandidateCount: 3,
          qualifiedCandidateCount: 2,
          latestRunId: 'run-latest',
          latestRunStatus: 'success',
          latestRunUpdatedAt: now,
        },
      },
      { ...sampleJobDescription, id: 'jd-failed', status: 'publish_failed' },
      { ...sampleJobDescription, id: 'jd-offline', status: 'offline' },
    ]);
    createCandidateScreeningRunMock.mockResolvedValueOnce({ ...sampleRun, id: 'run-new' });

    render(<JDListView />);

    const actionCells = await screen.findAllByLabelText('JD 操作');
    expect(actionCells).toHaveLength(6);
    for (const cell of actionCells) {
      expect(cell.className).toContain('md:w-[360px]');
    }
    const detailLinks = screen.getAllByText('详情').map((node) => node.closest('a'));
    expect(detailLinks).toHaveLength(6);
    expect(parsedHref(detailLinks[3]?.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-published',
    );
    expectReturnContext(detailLinks[3]?.getAttribute('href') ?? '', '/jd-generator', '返回列表');
    const editLink = (await screen.findByText('编辑')).closest('a');
    expect(parsedHref(editLink?.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-created',
    );
    expect(
      parsedHref(screen.getByText('发布').closest('a')?.getAttribute('href') ?? '').pathname,
    ).toBe('/jd-generator/jd-ready');
    expect(
      parsedHref(screen.getByText('发布记录').closest('a')?.getAttribute('href') ?? '').pathname,
    ).toBe('/jd-generator/jd-publishing');
    expect(
      parsedHref(screen.getByText('重试发布').closest('a')?.getAttribute('href') ?? '').pathname,
    ).toBe('/jd-generator/jd-failed');
    expect(
      parsedHref(screen.getByText('查看').closest('a')?.getAttribute('href') ?? '').pathname,
    ).toBe('/jd-generator/jd-offline');
    const runLogHref = screen.getByText('筛选记录').closest('a')?.getAttribute('href') ?? '';
    expect(parsedHref(runLogHref).pathname).toBe(
      '/jd-generator/jd-published/screening-runs/run-latest',
    );
    expectReturnContext(runLogHref, '/jd-generator', '返回列表');
    const candidatesHref = screen.getByText('候选人').closest('a')?.getAttribute('href') ?? '';
    expect(parsedHref(candidatesHref).pathname).toBe('/jd-generator/jd-published/candidates');
    expectReturnContext(candidatesHref, '/jd-generator', '返回列表');

    fireEvent.click(screen.getByText('继续筛选').closest('button') as HTMLButtonElement);

    await waitFor(() =>
      expect(createCandidateScreeningRunMock).toHaveBeenCalledWith('jd-published', {
        platform: 'boss-like',
        mode: 'execution',
      }),
    );
    const pushedRunHref = routerPushMock.mock.calls[0]?.[0] as string;
    expect(parsedHref(pushedRunHref).pathname).toBe(
      '/jd-generator/jd-published/screening-runs/run-new',
    );
    expectReturnContext(pushedRunHref, '/jd-generator', '返回列表');
  });

  it('starts an execution screening run and opens the run log page', async () => {
    render(<JDDetailView jobDescriptionId="jd-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '筛选并执行' }));

    await waitFor(() =>
      expect(createCandidateScreeningRunMock).toHaveBeenCalledWith('jd-1', {
        platform: 'boss-like',
        mode: 'execution',
      }),
    );
    const pushedRunHref = routerPushMock.mock.calls[0]?.[0] as string;
    expect(parsedHref(pushedRunHref).pathname).toBe('/jd-generator/jd-1/screening-runs/run-1');
    expectReturnContext(pushedRunHref, '/jd-generator/jd-1', '返回 JD');
  });

  it('screening run log renders execution steps, summary counts, and per-candidate outcomes', async () => {
    fetchJdCandidatesMock.mockResolvedValueOnce([
      sampleCandidateListItem,
      {
        ...sampleCandidateListItem,
        id: 'result-2',
        candidateId: 'cand-2',
        finalScore: 68,
        rank: 2,
        decisionAction: 'chat',
        decisionReason: '分数不足，不能计入合格',
        candidate: {
          ...sampleCandidate,
          id: 'cand-2',
          displayName: '低分候选人',
        },
      },
      {
        ...sampleCandidateListItem,
        id: 'result-3',
        candidateId: 'cand-3',
        finalScore: 82,
        rank: 3,
        decisionAction: 'skip',
        actionStatus: 'skipped',
        decisionReason: '地点不匹配',
        candidate: {
          ...sampleCandidate,
          id: 'cand-3',
          displayName: '跳过候选人',
        },
      },
    ]);

    render(<CandidateScreeningRunLog jobDescriptionId="jd-1" runId="run-1" />);

    expect(await screen.findByText('筛选执行日志')).toBeInTheDocument();
    expect(fetchCandidateScreeningRunWithEventsMock).toHaveBeenCalledWith('run-1');
    expect(fetchJdCandidatesMock).toHaveBeenCalledWith('jd-1', {
      runId: 'run-1',
      limit: 100,
    });
    expect(screen.getByText('3 条')).toBeInTheDocument();
    expect(screen.getByText('2 条合格')).toBeInTheDocument();
    expect(screen.getByText('1 条入选')).toBeInTheDocument();
    expect(screen.getByText('制定搜索计划')).toBeInTheDocument();
    expect(screen.getByText('执行动作')).toBeInTheDocument();
    expect(screen.getAllByText('Java 微服务 招聘 SaaS').length).toBeGreaterThan(0);
    expect(screen.getByText('完成评估：Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('总分 90')).toBeInTheDocument();
    expect(screen.getByText('技能 90')).toBeInTheDocument();
    expect(screen.getAllByText('动作 chat · high').length).toBeGreaterThan(0);
    expect(
      screen.getByText('发送内容：你好 Ada，我们正在招聘高级后端工程师，想进一步沟通一下。'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Java 微服务和招聘 SaaS 经验匹配').length).toBeGreaterThan(0);
    expect(
      screen.getByText('评估池：Vector Recall Candidate · vector_recall · 匹配 0.98'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('评估池：Live Search Candidate · live_search · 匹配 1.00'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('排序：#1 Ada Lovelace · both · 总分 90 · 匹配 1.00'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('排序：#2 Grace Hopper · vector_recall · 总分 89 · 匹配 0.82'),
    ).toBeInTheDocument();
    expect(screen.getByText('重复于：Ada One')).toBeInTheDocument();
    expect(screen.getByText('历史评估：previous-run')).toBeInTheDocument();
    expect(screen.getByText('动作 collect · medium')).toBeInTheDocument();
    expect(screen.getByText('低分候选人')).toBeInTheDocument();
    expect(screen.getByText('未达标')).toBeInTheDocument();
    expect(screen.getByText('跳过候选人')).toBeInTheDocument();
    expect(screen.getByText('已跳过')).toBeInTheDocument();
  });

  it('screening run log returns to the supplied source context', async () => {
    mockSearchParams = new URLSearchParams('returnTo=/jd-generator&returnLabel=返回列表');

    render(<CandidateScreeningRunLog jobDescriptionId="jd-1" runId="run-1" />);

    expect(await screen.findByRole('button', { name: '返回列表' })).toHaveAttribute(
      'href',
      '/jd-generator',
    );
  });

  it('starts a global batch communication run from the JD workbench', async () => {
    render(<JDListView />);

    fireEvent.click(await screen.findByRole('button', { name: '批量沟通' }));

    await waitFor(() =>
      expect(startCandidateCommunicationRunMock).toHaveBeenCalledWith({
        mode: 'batch',
        platform: 'boss-like',
        maxPasses: 10,
      }),
    );
    const pushedRunHref = routerPushMock.mock.calls[0]?.[0] as string;
    expect(parsedHref(pushedRunHref).pathname).toBe('/jd-generator/communication-runs/comm-run-1');
    expectReturnContext(pushedRunHref, '/jd-generator', '返回 JD 工作台');
  });

  it('candidate list renders score, decision, source, action status, and interview stage', async () => {
    render(<CandidateList jobDescriptionId="jd-1" />);

    const row = await screen.findByRole('link', { name: /Ada Lovelace/ });
    await waitFor(() =>
      expect(fetchJdCandidatesMock).toHaveBeenCalledWith(
        'jd-1',
        expect.objectContaining({ minScore: 70 }),
      ),
    );
    expect(screen.getByRole('button', { name: '返回 JD' })).toHaveAttribute(
      'href',
      '/jd-generator/jd-1',
    );
    expect(parsedHref(row.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-1/candidates/cand-1',
    );
    expectReturnContext(
      row.getAttribute('href') ?? '',
      '/jd-generator/jd-1/candidates',
      '返回候选人',
    );
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getAllByText('chat').length).toBeGreaterThan(0);
    expect(screen.getAllByText('both').length).toBeGreaterThan(0);
    expect(screen.getByText('planned')).toBeInTheDocument();
    expect(screen.getAllByText('to_contact').length).toBeGreaterThan(0);
  });

  it('candidate list returns to the supplied source and keeps the JD list as detail parent', async () => {
    mockSearchParams = new URLSearchParams('returnTo=/candidates&returnLabel=返回候选人列表');

    render(<CandidateList jobDescriptionId="jd-1" />);

    expect(await screen.findByRole('button', { name: '返回候选人列表' })).toHaveAttribute(
      'href',
      '/candidates',
    );

    const row = screen.getByRole('link', { name: /Ada Lovelace/ });
    const detailHref = row.getAttribute('href') ?? '';
    expect(parsedHref(detailHref).pathname).toBe('/jd-generator/jd-1/candidates/cand-1');
    const detailReturnTo = parsedHref(detailHref).searchParams.get('returnTo');
    expect(detailReturnTo).not.toBeNull();
    const nestedReturn = parsedHref(detailReturnTo ?? '');
    expect(nestedReturn.pathname).toBe('/jd-generator/jd-1/candidates');
    expect(nestedReturn.searchParams.get('returnTo')).toBe('/candidates');
    expect(nestedReturn.searchParams.get('returnLabel')).toBe('返回候选人列表');
    expect(parsedHref(detailHref).searchParams.get('returnLabel')).toBe('返回候选人');
  });

  it('renders resume library with mounted JD links and resume summary', async () => {
    render(<ResumeLibrary />);

    expect(await screen.findByRole('heading', { name: '简历列表' })).toBeInTheDocument();

    const candidateLink = screen.getByRole('link', { name: 'Ada Lovelace' });
    expect(parsedHref(candidateLink.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-1/candidates/cand-1',
    );
    expectReturnContext(candidateLink.getAttribute('href') ?? '', '/resumes', '返回简历列表');

    const jdLink = screen.getByRole('link', { name: 'Frontend Engineer' });
    expect(parsedHref(jdLink.getAttribute('href') ?? '').pathname).toBe('/jd-generator/jd-1');
    expectReturnContext(jdLink.getAttribute('href') ?? '', '/resumes', '返回简历列表');

    expect(screen.getByRole('link', { name: '查看原站' })).toHaveAttribute(
      'href',
      '/api/jd/jd-1/candidates/cand-1/original-profile',
    );
    expect(screen.getByText(/Java 微服务，分布式系统，招聘 SaaS/)).toBeInTheDocument();
  });

  it('resume library exposes candidate detail links for each visible mounted JD', async () => {
    fetchCandidateResumeLibraryMock.mockResolvedValueOnce([
      {
        ...sampleResumeLibraryItem,
        mountedJobs: [
          sampleResumeLibraryItem.mountedJobs[0],
          {
            ...sampleResumeLibraryItem.mountedJobs[0],
            screeningResultId: 'result-2',
            finalScore: 86,
            jobDescription: {
              id: 'jd-2',
              department: 'Engineering',
              position: 'Backend Engineer',
              status: 'published',
              title: 'Backend Engineer',
              updatedAt: now,
            },
          },
          {
            ...sampleResumeLibraryItem.mountedJobs[0],
            screeningResultId: 'result-3',
            finalScore: 82,
            jobDescription: {
              id: 'jd-3',
              department: 'Data',
              position: 'Data Engineer',
              status: 'published',
              title: 'Data Engineer',
              updatedAt: now,
            },
          },
          {
            ...sampleResumeLibraryItem.mountedJobs[0],
            screeningResultId: 'result-4',
            finalScore: 78,
            jobDescription: {
              id: 'jd-4',
              department: 'Platform',
              position: 'Platform Engineer',
              status: 'published',
              title: 'Platform Engineer',
              updatedAt: now,
            },
          },
        ],
      },
    ]);

    render(<ResumeLibrary />);

    const frontendLink = await screen.findByRole('link', { name: 'Frontend Engineer' });
    expect(parsedHref(frontendLink.getAttribute('href') ?? '').pathname).toBe('/jd-generator/jd-1');
    expectReturnContext(frontendLink.getAttribute('href') ?? '', '/resumes', '返回简历列表');
    const backendLink = screen.getByRole('link', { name: 'Backend Engineer' });
    expect(parsedHref(backendLink.getAttribute('href') ?? '').pathname).toBe('/jd-generator/jd-2');
    expectReturnContext(backendLink.getAttribute('href') ?? '', '/resumes', '返回简历列表');
    expect(
      screen.getByRole('link', { name: '查看 Backend Engineer 的候选人详情' }),
    ).toHaveAttribute('href', expect.stringContaining('/jd-generator/jd-2/candidates/cand-1'));
    expectReturnContext(
      screen
        .getByRole('link', { name: '查看 Backend Engineer 的候选人详情' })
        .getAttribute('href') ?? '',
      '/resumes',
      '返回简历列表',
    );
    const dataLink = screen.getByRole('link', { name: 'Data Engineer' });
    expect(parsedHref(dataLink.getAttribute('href') ?? '').pathname).toBe('/jd-generator/jd-3');
    expectReturnContext(dataLink.getAttribute('href') ?? '', '/resumes', '返回简历列表');
    expect(screen.queryByRole('link', { name: 'Platform Engineer' })).not.toBeInTheDocument();
    expect(screen.getByText('+1 个')).toBeInTheDocument();
  });

  it('resume library handles unmounted resumes with original profile fallback', async () => {
    fetchCandidateResumeLibraryMock.mockResolvedValueOnce([
      {
        resume: {
          ...sampleResume,
          profileUrl: 'https://boss-like.test/resumes/resume-1',
        },
        candidate: {
          ...sampleCandidate,
          profileUrl: 'https://boss-like.test/candidates/cand-1',
        },
        mountedJobs: [],
      },
    ]);

    render(<ResumeLibrary />);

    expect(await screen.findByText('未挂载 JD')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ada Lovelace' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看原站' })).toHaveAttribute(
      'href',
      'https://boss-like.test/candidates/cand-1',
    );
  });

  it('resume library renders an empty state', async () => {
    fetchCandidateResumeLibraryMock.mockResolvedValueOnce([]);

    render(<ResumeLibrary />);

    expect(await screen.findByText('暂无简历资源。')).toBeInTheDocument();
  });

  it('renders interview records with candidate and JD context', async () => {
    render(<InterviewRecordList />);

    expect(await screen.findByRole('heading', { name: '面试记录' })).toBeInTheDocument();

    const candidateLink = screen.getByRole('link', { name: 'Ada Lovelace' });
    expect(parsedHref(candidateLink.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-1/candidates/cand-1',
    );
    expectReturnContext(candidateLink.getAttribute('href') ?? '', '/interviews', '返回面试记录');

    const jdLink = screen.getByRole('link', { name: 'Frontend Engineer' });
    expect(parsedHref(jdLink.getAttribute('href') ?? '').pathname).toBe('/jd-generator/jd-1');
    expectReturnContext(jdLink.getAttribute('href') ?? '', '/interviews', '返回面试记录');

    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getAllByText('pass').length).toBeGreaterThan(0);
    expect(screen.getByText('Java 基础扎实')).toBeInTheDocument();
  });

  it('interview records filters by decision', async () => {
    fetchCandidateInterviewRecordsMock.mockResolvedValueOnce([
      {
        ...sampleFeedback,
        candidate: sampleCandidate,
        jobDescription: {
          id: 'jd-1',
          department: 'Engineering',
          position: 'Frontend Engineer',
          status: 'published',
          title: 'Frontend Engineer',
          updatedAt: now,
        },
      } satisfies CandidateInterviewRecordDto,
      {
        ...sampleFeedback,
        id: 'feedback-2',
        jobDescriptionId: 'jd-2',
        candidateId: 'cand-2',
        interviewer: 'Katherine Johnson',
        pros: ['算法能力强'],
        decision: 'reject',
        candidate: {
          ...sampleCandidate,
          id: 'cand-2',
          displayName: 'Alan Turing',
        },
        jobDescription: {
          id: 'jd-2',
          department: 'Engineering',
          position: 'Backend Engineer',
          status: 'published',
          title: 'Backend Engineer',
          updatedAt: now,
        },
      } satisfies CandidateInterviewRecordDto,
    ]);

    render(<InterviewRecordList />);

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('面试结论筛选'), { target: { value: 'reject' } });

    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument();
    expect(screen.getByText('Katherine Johnson')).toBeInTheDocument();
    expect(screen.getByText('算法能力强')).toBeInTheDocument();
    expect(screen.getAllByText('reject').length).toBeGreaterThan(0);
  });

  it('candidate list can switch from qualified scores to all scores', async () => {
    render(<CandidateList jobDescriptionId="jd-1" />);

    await screen.findByRole('link', { name: /Ada Lovelace/ });
    fireEvent.change(screen.getByLabelText('分数范围'), { target: { value: 'all' } });

    await waitFor(() =>
      expect(fetchJdCandidatesMock).toHaveBeenLastCalledWith(
        'jd-1',
        expect.objectContaining({ minScore: undefined }),
      ),
    );
  });

  it('candidate tracking dashboard shows JD summaries and linked candidates', async () => {
    render(<CandidateTrackingDashboard />);

    expect(await screen.findByText('候选人跟踪')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '返回 JD 工作台' })).not.toBeInTheDocument();
    expect(screen.getByText('1 个跟进中')).toBeInTheDocument();
    expect(screen.getByText('1 个面试中')).toBeInTheDocument();
    expect(screen.getByText('下周一面')).toBeInTheDocument();

    const candidateLink = screen.getByRole('link', { name: /Ada Lovelace/ });
    expect(parsedHref(candidateLink.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-1/candidates/cand-1',
    );
    expectReturnContext(candidateLink.getAttribute('href') ?? '', '/candidates', '返回候选人列表');
    const scopedListLink = screen.getByRole('button', { name: '查看候选人' });
    expect(parsedHref(scopedListLink.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-1/candidates',
    );
    expectReturnContext(scopedListLink.getAttribute('href') ?? '', '/candidates', '返回候选人列表');
    expect(screen.getByRole('button', { name: '查看原站' })).toHaveAttribute(
      'href',
      '/api/jd/jd-1/candidates/cand-1/original-profile',
    );
  });

  it('candidate tracking dashboard separates active and ended candidates', async () => {
    fetchCandidateTrackingOverviewMock.mockResolvedValueOnce({
      jobs: sampleTrackingOverview.jobs,
      candidates: [
        sampleTrackingOverview.candidates[0],
        {
          ...sampleTrackingOverview.candidates[0],
          id: 'result-ended',
          candidateId: 'cand-ended',
          candidate: {
            ...sampleCandidate,
            id: 'cand-ended',
            displayName: 'Ended Candidate',
          },
          interviewStage: 'rejected',
          decisionAction: 'skip',
        },
        {
          ...sampleTrackingOverview.candidates[0],
          id: 'result-offer',
          candidateId: 'cand-offer',
          candidate: {
            ...sampleCandidate,
            id: 'cand-offer',
            displayName: 'Offer Candidate',
          },
          interviewStage: 'offer',
        },
      ],
    });

    render(<CandidateTrackingDashboard />);

    const activeCandidateLink = await screen.findByRole('link', { name: /Ada Lovelace/ });
    expect(activeCandidateLink).toBeInTheDocument();
    const activeCandidateRow = activeCandidateLink.closest('article');
    expect(activeCandidateRow).not.toBeNull();
    expect(within(activeCandidateRow as HTMLElement).getByText('正在推进')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ended Candidate/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('跟踪范围'), { target: { value: 'ended' } });

    expect(await screen.findByRole('link', { name: /Ended Candidate/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Offer Candidate/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ada Lovelace/ })).not.toBeInTheDocument();
    expect(screen.getByText('淘汰')).toBeInTheDocument();
    expect(screen.getByText('录取/Offer')).toBeInTheDocument();
  });

  it('starts a global batch communication run from the tracking dashboard', async () => {
    render(<CandidateTrackingDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: '批量沟通' }));

    await waitFor(() =>
      expect(startCandidateCommunicationRunMock).toHaveBeenCalledWith({
        mode: 'batch',
        platform: 'boss-like',
        maxPasses: 10,
      }),
    );
    const pushedRunHref = routerPushMock.mock.calls[0]?.[0] as string;
    expect(parsedHref(pushedRunHref).pathname).toBe('/jd-generator/communication-runs/comm-run-1');
    expectReturnContext(pushedRunHref, '/candidates', '返回候选人列表');
  });

  it('starts a single-candidate communication run from candidate detail', async () => {
    startCandidateCommunicationRunMock.mockResolvedValueOnce({
      ...sampleCommunicationRun,
      id: 'comm-run-single',
      mode: 'single',
      candidateId: 'cand-1',
      candidate: { id: 'cand-1', displayName: 'Ada Lovelace' },
    });

    render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    fireEvent.click(await screen.findByRole('button', { name: '单点沟通' }));

    await waitFor(() =>
      expect(startCandidateCommunicationRunMock).toHaveBeenCalledWith({
        mode: 'single',
        jobDescriptionId: 'jd-1',
        candidateId: 'cand-1',
        sourceScreeningRunId: 'run-1',
        platform: 'boss-like',
      }),
    );
    const pushedRunHref = routerPushMock.mock.calls[0]?.[0] as string;
    expect(parsedHref(pushedRunHref).pathname).toBe(
      '/jd-generator/communication-runs/comm-run-single',
    );
    expectReturnContext(pushedRunHref, '/jd-generator/jd-1/candidates/cand-1', '返回候选人详情');
  });

  it('renders a communication run log with scope, steps, stats, and records', async () => {
    render(<CandidateCommunicationRunLog runId="comm-run-1" />);

    expect(await screen.findByText('沟通执行日志')).toBeInTheDocument();
    expect(fetchCandidateCommunicationRunMock).toHaveBeenCalledWith('comm-run-1');
    expect(screen.getAllByText('批量沟通').length).toBeGreaterThan(0);
    expect(screen.getByText('高级后端工程师')).toBeInTheDocument();
    expect(screen.getByText('2 条')).toBeInTheDocument();
    expect(screen.getByText('2 条选中')).toBeInTheDocument();
    expect(screen.getByText('2 条已处理')).toBeInTheDocument();
    expect(screen.getByText('读取沟通范围')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('已处理未读消息')).toBeInTheDocument();
  });

  it('communication run log falls back to the canonical cross-JD dashboard', async () => {
    fetchCandidateCommunicationRunMock.mockResolvedValueOnce({
      ...sampleCommunicationRun,
      jobDescriptionId: null,
      jobDescription: null,
      candidateId: null,
      candidate: null,
    });

    render(<CandidateCommunicationRunLog runId="comm-run-1" />);

    expect(await screen.findByRole('button', { name: '返回范围' })).toHaveAttribute(
      'href',
      '/candidates',
    );
  });

  it('communication run log returns to the supplied source context', async () => {
    mockSearchParams = new URLSearchParams('returnTo=/resumes&returnLabel=返回简历列表');

    render(<CandidateCommunicationRunLog runId="comm-run-1" />);

    expect(await screen.findByRole('button', { name: '返回简历列表' })).toHaveAttribute(
      'href',
      '/resumes',
    );
  });

  it('candidate detail renders resume text and score reason', async () => {
    render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/Java 微服务，分布式系统/)).toBeInTheDocument();
    expect(screen.getByText('Java 微服务和招聘 SaaS 经验匹配')).toBeInTheDocument();
  });

  it('candidate detail returns to the supplied source context', async () => {
    mockSearchParams = new URLSearchParams('returnTo=/resumes&returnLabel=返回简历列表');

    render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByRole('button', { name: '返回简历列表' })).toHaveAttribute(
      'href',
      '/resumes',
    );
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

  it('candidate detail saves interview feedback rounds and evaluates hiring decision', async () => {
    render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByText('一面')).toBeInTheDocument();
    expect(screen.getByText('二面')).toBeInTheDocument();
    expect(screen.getByText('终面')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('一面面试官'), {
      target: { value: 'Grace Hopper' },
    });
    fireEvent.change(screen.getByLabelText('一面评分'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('一面优势'), {
      target: { value: 'Java 基础扎实\n业务理解好' },
    });
    fireEvent.change(screen.getByLabelText('一面不足'), {
      target: { value: '系统设计还需追问' },
    });
    fireEvent.change(screen.getByLabelText('一面结论'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: '保存一面' }));

    await waitFor(() =>
      expect(saveCandidateInterviewFeedbackMock).toHaveBeenCalledWith('jd-1', 'cand-1', {
        stage: 'first_interview',
        interviewer: 'Grace Hopper',
        rating: 4,
        pros: ['Java 基础扎实', '业务理解好'],
        cons: ['系统设计还需追问'],
        decision: 'pass',
        notes: '建议推进二面',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '生成录用建议' }));

    await waitFor(() =>
      expect(evaluateJdCandidateDecisionMock).toHaveBeenCalledWith('jd-1', 'cand-1'),
    );
    expect(await screen.findByText('建议录用')).toBeInTheDocument();
    expect(screen.getByText('接受 offer 概率 68%')).toBeInTheDocument();
    expect(screen.getByText('先确认薪资预期再发 offer')).toBeInTheDocument();
  });
});
