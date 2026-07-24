import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { JDDetailView, JDListView } from '@/components/jd-generator/jd-pages';
import { CandidateList } from '@/components/candidate-screening/candidate-list';
import { InterviewRecordList } from '@/components/candidate-screening/interview-record-list';
import { ResumeLibrary } from '@/components/candidate-screening/resume-library';
import { CandidateCommunicationRunLog } from '@/components/candidate-communication/communication-run-log';
import { CandidateDetail } from '@/components/candidate-screening/candidate-detail';
import { CandidateInterviewDetail } from '@/components/candidate-screening/candidate-interview-detail';
import { CandidateDecisionRun } from '@/components/candidate-screening/candidate-decision-run';
import { CandidateScreeningRunLog } from '@/components/candidate-screening/screening-run-log';
import { CandidateTrackingDashboard } from '@/components/candidate-screening/tracking-dashboard';
import { RecruitmentStatsPage } from '@/components/dashboard/recruitment-stats-page';
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
const fetchJobDescriptionPublishHistoryMock = jest.fn();
const fetchJobDescriptionPublishTasksMock = jest.fn();
const fetchJobDescriptionCreateRunsMock = jest.fn();
const fetchJobDescriptionRegenerateRunsMock = jest.fn();
const updateJobDescriptionResourceMock = jest.fn();
const publishJobDescriptionResourceMock = jest.fn();
const createCandidateScreeningRunMock = jest.fn();
const fetchCandidateScreeningRunsMock = jest.fn();
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
const fetchCompanySettingsMock = jest.fn();
const routerPushMock = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, refresh: jest.fn() }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock('@/lib/jd/client', () => ({
  createJobDescriptionFromInput: jest.fn(),
  fetchJobDescription: (...args: unknown[]) => fetchJobDescriptionMock(...args),
  fetchJobDescriptionPublishHistory: (...args: unknown[]) =>
    fetchJobDescriptionPublishHistoryMock(...args),
  fetchJobDescriptionCreateRuns: (...args: unknown[]) => fetchJobDescriptionCreateRunsMock(...args),
  fetchJobDescriptionRegenerateRuns: (...args: unknown[]) =>
    fetchJobDescriptionRegenerateRunsMock(...args),
  fetchJobDescriptionPublishTasks: (...args: unknown[]) =>
    fetchJobDescriptionPublishTasksMock(...args),
  fetchJobDescriptions: (...args: unknown[]) => fetchJobDescriptionsMock(...args),
  publishJobDescriptionResource: (...args: unknown[]) => publishJobDescriptionResourceMock(...args),
  startJobDescriptionRegenerateRun: jest.fn(),
  updateJobDescriptionResource: (...args: unknown[]) => updateJobDescriptionResourceMock(...args),
}));

jest.mock('@/lib/candidate-screening/client', () => ({
  createCandidateScreeningRun: (...args: unknown[]) => createCandidateScreeningRunMock(...args),
  fetchCandidateScreeningRuns: (...args: unknown[]) => fetchCandidateScreeningRunsMock(...args),
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

jest.mock('@/lib/company-profile/client', () => ({
  fetchCompanyProfile: jest.fn().mockResolvedValue(null),
  fetchCompanySettings: (...args: unknown[]) => fetchCompanySettingsMock(...args),
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
  Modal: ({ children, isOpen }: { children: React.ReactNode; isOpen?: boolean }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
  ModalBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  salaryRange: null,
  workLocations: [],
  hiringTarget: 2,
  onboardedCount: 0,
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
  skillId: 'screen-candidates-v2',
  workflow: { name: 'screen_candidates', version: 2 },
  currentWorkflowStep: 'chat_candidate',
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
  latestPlannedChatRunId: 'run-1',
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
  dimensionRatings: [
    { dimension: 'core_competency', score: 4, evidence: '能独立完成 Java 核心服务开发' },
    { dimension: 'problem_solving', score: 4, evidence: '能解释系统设计取舍' },
  ],
  pros: ['Java 基础扎实'],
  cons: ['系统设计还需追问'],
  decision: 'pass',
  notes: '建议推进二面',
  createdAt: now,
  updatedAt: now,
};

const samplePhoneScreenFeedback: CandidateInterviewFeedbackDto = {
  ...sampleFeedback,
  id: 'feedback-phone-screen',
  stage: 'phone_screen',
  interviewer: 'Katherine Johnson',
  notes: '沟通意愿与基本条件匹配',
};

const sampleDecisionResult: CandidateDecisionResultDto = {
  decisionScope: 'preliminary',
  missingFeedbackStages: ['phone_screen', 'second_interview', 'final_interview'],
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
  dimensionAssessments: [
    {
      key: 'core_competency',
      label: '核心任务胜任力',
      score: 0.86,
      weight: 0.35,
      contribution: 0.3,
      confidence: 0.85,
      status: 'strong',
      summary: '综合简历与面试证据评估',
      evidence: ['Java 基础扎实'],
    },
    {
      key: 'problem_solving',
      label: '复杂问题解决与专业判断',
      score: 0.8,
      weight: 0.2,
      contribution: 0.16,
      confidence: 0.8,
      status: 'strong',
      summary: '综合简历与面试证据评估',
      evidence: ['能解释系统设计取舍'],
    },
    {
      key: 'impact',
      label: '成果与业务影响力',
      score: 0.8,
      weight: 0.2,
      contribution: 0.16,
      confidence: 0.7,
      status: 'strong',
      summary: '综合项目规模和结果评估',
      evidence: ['候选人经验 8 年'],
    },
    {
      key: 'collaboration',
      label: '协作、推动与责任感',
      score: 0.75,
      weight: 0.15,
      contribution: 0.11,
      confidence: 0.7,
      status: 'acceptable',
      summary: '综合协作案例评估',
      evidence: ['沟通清晰'],
    },
    {
      key: 'motivation',
      label: '动机与角色契合',
      score: 0.9,
      weight: 0.1,
      contribution: 0.09,
      confidence: 0.75,
      status: 'strong',
      summary: '岗位动机明确',
      evidence: ['沟通意愿与基本条件匹配'],
    },
    {
      key: 'risk',
      label: '风险健康度',
      score: 0.8,
      weight: 0,
      contribution: 0,
      confidence: 0.8,
      status: 'acceptable',
      summary: '发现 1 项风险信号',
      evidence: ['薪资敏感'],
    },
  ],
  decisionTrace: {
    weightedScore: 0.86,
    hardRejected: false,
    formula: [
      {
        key: 'core_competency',
        label: '核心任务胜任力',
        score: 0.86,
        weight: 0.35,
        contribution: 0.3,
      },
      {
        key: 'problem_solving',
        label: '复杂问题解决与专业判断',
        score: 0.8,
        weight: 0.2,
        contribution: 0.16,
      },
      {
        key: 'impact',
        label: '成果与业务影响力',
        score: 0.8,
        weight: 0.2,
        contribution: 0.16,
      },
      {
        key: 'collaboration',
        label: '协作、推动与责任感',
        score: 0.75,
        weight: 0.15,
        contribution: 0.11,
      },
      {
        key: 'motivation',
        label: '动机与角色契合',
        score: 0.9,
        weight: 0.1,
        contribution: 0.09,
      },
    ],
    thresholds: {
      strongYes: 0.82,
      strongYesDimensionFloor: 0.6,
      yes: 0.65,
      preliminaryYes: 0.6,
      hardRejectCoreCompetency: 0.4,
    },
    feedbackCoverage: { completed: 1, total: 4 },
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
        hiringTarget: 3,
        onboardedCount: 1,
        title: '高级后端工程师',
        updatedAt: now,
      },
      totalCandidates: 2,
      hiringGap: 2,
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
        hiringTarget: 3,
        onboardedCount: 1,
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
    fetchJobDescriptionPublishHistoryMock.mockReset();
    fetchJobDescriptionCreateRunsMock.mockReset();
    fetchJobDescriptionRegenerateRunsMock.mockReset();
    fetchJobDescriptionPublishTasksMock.mockReset();
    updateJobDescriptionResourceMock.mockReset();
    publishJobDescriptionResourceMock.mockReset();
    createCandidateScreeningRunMock.mockReset();
    fetchCandidateScreeningRunsMock.mockReset();
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
    fetchCompanySettingsMock.mockReset();
    routerPushMock.mockReset();
    startCandidateCommunicationRunMock.mockResolvedValue(sampleCommunicationRun);
    fetchCandidateCommunicationRunMock.mockResolvedValue(sampleCommunicationRun);
    fetchCompanySettingsMock.mockResolvedValue({
      profile: null,
      platforms: [
        {
          id: 'boss-like',
          label: 'BOSS-like 本地站点',
          shortLabel: 'BOSS-like',
          description: '本地招聘平台',
          kind: 'local',
          defaultBaseUrl: 'http://localhost:6183',
          defaultVariables: {},
        },
      ],
    });
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
    fetchJobDescriptionPublishHistoryMock.mockResolvedValue({ tasks: [], runs: [] });
    fetchJobDescriptionCreateRunsMock.mockResolvedValue([]);
    fetchJobDescriptionRegenerateRunsMock.mockResolvedValue([]);
    fetchJobDescriptionPublishTasksMock.mockResolvedValue([]);
    createCandidateScreeningRunMock.mockResolvedValue(sampleRun);
    fetchCandidateScreeningRunsMock.mockResolvedValue([]);
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
    const offlineCandidateHref = screen
      .getAllByText('候选人')
      .map((node) => node.closest('a')?.getAttribute('href') ?? '')
      .find((href) => parsedHref(href).pathname === '/jd-generator/jd-offline/candidates');
    expect(offlineCandidateHref).toBeDefined();
    const runLogHref = screen.getByText('筛选记录').closest('a')?.getAttribute('href') ?? '';
    expect(parsedHref(runLogHref).pathname).toBe(
      '/jd-generator/jd-published/screening-runs/run-latest',
    );
    expectReturnContext(runLogHref, '/jd-generator', '返回列表');
    const candidatesHref =
      screen
        .getAllByText('候选人')
        .map((node) => node.closest('a')?.getAttribute('href') ?? '')
        .find((href) => parsedHref(href).pathname === '/jd-generator/jd-published/candidates') ??
      '';
    expect(parsedHref(candidatesHref).pathname).toBe('/jd-generator/jd-published/candidates');
    expectReturnContext(candidatesHref, '/jd-generator', '返回列表');

    fireEvent.click(screen.getByText('继续筛选').closest('button') as HTMLButtonElement);
    fireEvent.click(await screen.findByRole('button', { name: '开始筛选' }));

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
    expect(await screen.findByText('筛选浏览器 Workflow')).toBeInTheDocument();
    expect(screen.getByText('screen_candidates · v2')).toBeInTheDocument();
    expect(screen.getByText('当前步骤：chat_candidate')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看 Workflow 详情' })).toHaveAttribute(
      'href',
      '/workflows/screen-candidates-v2?returnTo=%2Fjd-generator%2Fjd-1%2Fscreening-runs%2Frun-1&returnLabel=%E8%BF%94%E5%9B%9E%E7%AD%9B%E9%80%89%E8%AE%B0%E5%BD%95',
    );
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

  it('screening run log identifies historical runs without a linked Workflow', async () => {
    fetchCandidateScreeningRunWithEventsMock.mockResolvedValueOnce({
      run: {
        ...sampleRun,
        skillId: null,
        workflow: null,
        currentWorkflowStep: null,
      },
      events: sampleRunEvents,
    });

    render(<CandidateScreeningRunLog jobDescriptionId="jd-1" runId="run-1" />);

    expect(await screen.findByText('历史任务未关联 Workflow')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '查看 Workflow 详情' })).not.toBeInTheDocument();
  });

  it('screening run log avoids a dead link when the linked Workflow was removed', async () => {
    fetchCandidateScreeningRunWithEventsMock.mockResolvedValueOnce({
      run: {
        ...sampleRun,
        workflow: null,
      },
      events: sampleRunEvents,
    });

    render(<CandidateScreeningRunLog jobDescriptionId="jd-1" runId="run-1" />);

    expect(await screen.findByText('关联的 Workflow 已不可用')).toBeInTheDocument();
    expect(screen.getByText('Skill ID: screen-candidates-v2')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '查看 Workflow 详情' })).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: '开始沟通' }));

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
    fetchCandidateScreeningRunsMock.mockResolvedValueOnce([
      sampleRun,
      {
        ...sampleRun,
        id: 'run-previous',
        skillId: 'screen-candidates-v1',
        workflow: { name: 'screen_candidates', version: 1 },
        createdAt: '2026-06-28T00:00:00.000Z',
        updatedAt: '2026-06-28T00:02:00.000Z',
      },
    ]);

    render(<CandidateList jobDescriptionId="jd-1" />);

    const row = await screen.findByRole('link', { name: /Ada Lovelace/ });
    await waitFor(() =>
      expect(fetchJdCandidatesMock).toHaveBeenCalledWith(
        'jd-1',
        expect.objectContaining({ minScore: undefined, limit: 100 }),
      ),
    );
    expect(fetchCandidateScreeningRunsMock).toHaveBeenCalledWith('jd-1');
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
    expect(screen.getAllByText('待联系').length).toBeGreaterThan(0);

    const sourceRunLink = screen.getByRole('link', { name: '来自第 2 次筛选' });
    expect(parsedHref(sourceRunLink.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-1/screening-runs/run-1',
    );
    expectReturnContext(
      sourceRunLink.getAttribute('href') ?? '',
      '/jd-generator/jd-1/candidates',
      '返回已筛选候选人',
    );

    const runHistory = screen.getByLabelText('筛选记录');
    expect(within(runHistory).getAllByRole('link', { name: /查看执行日志/ })).toHaveLength(2);
    const historyRunHref = within(runHistory)
      .getByRole('link', { name: /run-1.*查看执行日志/ })
      .getAttribute('href');
    expectReturnContext(historyRunHref ?? '', '/jd-generator/jd-1/candidates', '返回已筛选候选人');
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

    expect(screen.getByText('Engineering · 招聘中')).toBeInTheDocument();
    expect(screen.queryByText('Engineering · published')).not.toBeInTheDocument();
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
    expect(screen.getByRole('option', { name: '已入职' })).toHaveValue('onboarded');
    expect(screen.getByRole('option', { name: '未入职' })).toHaveValue('not_joined');
    expect(screen.getAllByText('待联系').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('分数范围'), { target: { value: 'all' } });

    await waitFor(() =>
      expect(fetchJdCandidatesMock).toHaveBeenLastCalledWith(
        'jd-1',
        expect.objectContaining({ minScore: undefined }),
      ),
    );
  });

  it('candidate tracking dashboard stays focused on filtering and linked candidates', async () => {
    render(<CandidateTrackingDashboard />);

    expect(await screen.findByText('候选人列表')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '返回 JD 工作台' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('招聘类型')).toHaveValue('recruiting');
    expect(screen.queryByLabelText('JD 筛选')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('招聘进度概览')).not.toBeInTheDocument();
    expect(screen.queryByText('招聘缺口与入职进度')).not.toBeInTheDocument();
    expect(screen.getByText('下周一面')).toBeInTheDocument();

    const candidateLink = screen.getByRole('link', { name: /Ada Lovelace/ });
    expect(parsedHref(candidateLink.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-1/candidates/cand-1',
    );
    expectReturnContext(candidateLink.getAttribute('href') ?? '', '/candidates', '返回候选人列表');
    expect(screen.getByRole('button', { name: '查看原站' })).toHaveAttribute(
      'href',
      '/api/jd/jd-1/candidates/cand-1/original-profile',
    );
  });

  it('recruitment stats calls out gaps and recruiting jobs without hiring targets', async () => {
    fetchCandidateTrackingOverviewMock.mockResolvedValueOnce({
      ...sampleTrackingOverview,
      jobs: [
        ...sampleTrackingOverview.jobs,
        {
          ...sampleTrackingOverview.jobs[0],
          jobDescription: {
            ...sampleTrackingOverview.jobs[0].jobDescription,
            id: 'jd-without-target',
            position: '数据工程师',
            title: '数据工程师',
            hiringTarget: null,
            onboardedCount: 0,
          },
          hiringGap: null,
          totalCandidates: 0,
          activeCandidates: 0,
          interviewingCandidates: 0,
          skippedCandidates: 0,
        },
        {
          ...sampleTrackingOverview.jobs[0],
          jobDescription: {
            ...sampleTrackingOverview.jobs[0].jobDescription,
            id: 'jd-filled',
            status: 'filled',
            hiringTarget: 1,
            onboardedCount: 1,
          },
          hiringGap: 0,
          activeCandidates: 7,
        },
      ],
    });

    render(<RecruitmentStatsPage />);

    expect(await screen.findByRole('heading', { name: '招聘统计' })).toBeInTheDocument();
    expect(await screen.findByText('2 个未招满岗位')).toBeInTheDocument();
    expect(screen.getByText('还缺 2 人')).toBeInTheDocument();
    expect(screen.getByText('1 个岗位未设置招聘目标')).toBeInTheDocument();
    expect(screen.getByText('未设置')).toBeInTheDocument();
    expect(screen.queryByText('未设置 人')).not.toBeInTheDocument();
    const activeCandidatesCard = screen.getByText('正在推进').parentElement?.parentElement;
    expect(activeCandidatesCard).not.toBeNull();
    expect(within(activeCandidatesCard as HTMLElement).getByText('1 人')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /查看已入职人员，共 2 人/ })).toHaveAttribute(
      'href',
      '/candidates?scope=onboarded&recruitmentType=all',
    );
  });

  it('candidate list opens the onboarded drill-down from recruitment stats', async () => {
    mockSearchParams = new URLSearchParams('scope=onboarded&recruitmentType=all');
    fetchCandidateTrackingOverviewMock.mockResolvedValueOnce({
      jobs: sampleTrackingOverview.jobs,
      candidates: [
        {
          ...sampleTrackingOverview.candidates[0],
          id: 'result-onboarded',
          candidateId: 'cand-onboarded',
          candidate: {
            ...sampleCandidate,
            id: 'cand-onboarded',
            displayName: 'Onboarded Candidate',
          },
          interviewStage: 'onboarded',
        },
      ],
    });

    render(<CandidateTrackingDashboard />);

    expect(screen.getByLabelText('招聘类型')).toHaveValue('all');
    expect(screen.getByLabelText('跟踪范围')).toHaveValue('onboarded');
    expect(await screen.findByRole('link', { name: /Onboarded Candidate/ })).toBeInTheDocument();
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
          decisionAction: 'skip',
        },
        {
          ...sampleTrackingOverview.candidates[0],
          id: 'result-onboarded',
          candidateId: 'cand-onboarded',
          candidate: {
            ...sampleCandidate,
            id: 'cand-onboarded',
            displayName: 'Onboarded Candidate',
          },
          interviewStage: 'onboarded',
        },
        {
          ...sampleTrackingOverview.candidates[0],
          id: 'result-not-joined',
          candidateId: 'cand-not-joined',
          candidate: {
            ...sampleCandidate,
            id: 'cand-not-joined',
            displayName: 'Not Joined Candidate',
          },
          interviewStage: 'not_joined',
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
    expect(screen.getByRole('link', { name: /Offer Candidate/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Onboarded Candidate/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('跟踪范围'), { target: { value: 'onboarded' } });

    expect(await screen.findByRole('link', { name: /Onboarded Candidate/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ended Candidate/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('跟踪范围'), { target: { value: 'ended' } });

    expect(await screen.findByRole('link', { name: /Ended Candidate/ })).toBeInTheDocument();
    const onboardedCandidateLink = screen.getByRole('link', { name: /Onboarded Candidate/ });
    const notJoinedCandidateLink = screen.getByRole('link', { name: /Not Joined Candidate/ });
    expect(onboardedCandidateLink).toBeInTheDocument();
    expect(notJoinedCandidateLink).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ada Lovelace/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Offer Candidate/ })).not.toBeInTheDocument();
    expect(screen.getByText('淘汰')).toBeInTheDocument();
    expect(
      within(onboardedCandidateLink.closest('article') as HTMLElement).getAllByText('已入职')
        .length,
    ).toBeGreaterThan(0);
    expect(
      within(notJoinedCandidateLink.closest('article') as HTMLElement).getAllByText('未入职')
        .length,
    ).toBeGreaterThan(0);
  });

  it('starts a global batch communication run from the tracking dashboard', async () => {
    render(<CandidateTrackingDashboard />);

    fireEvent.click(await screen.findByRole('button', { name: '批量沟通' }));

    await waitFor(() =>
      expect(startCandidateCommunicationRunMock).toHaveBeenCalledWith({
        mode: 'batch',
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

  it('starts single-candidate communication from the latest planned chat run after rescreening', async () => {
    fetchJdCandidateDetailMock.mockResolvedValueOnce({
      ...sampleCandidateDetail,
      runId: 'run-1',
      latestPlannedChatRunId: 'run-2',
      actionLogs: [
        {
          ...sampleCandidateDetail.actionLogs[0],
          id: 'action-log-run-2',
          runId: 'run-2',
          idempotencyKey: 'run-2:cand-1:chat',
        },
        {
          ...sampleCandidateDetail.actionLogs[0],
          status: 'success',
        },
      ],
    });
    startCandidateCommunicationRunMock.mockResolvedValueOnce({
      ...sampleCommunicationRun,
      id: 'comm-run-rescreened',
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
        sourceScreeningRunId: 'run-2',
        platform: 'boss-like',
      }),
    );
  });

  it.each(['collect', 'skip'] as const)(
    'does not offer single-candidate communication for a %s action plan',
    async (action) => {
      fetchJdCandidateDetailMock.mockResolvedValueOnce({
        ...sampleCandidateDetail,
        actionPlan: {
          ...sampleCandidateDetail.actionPlan,
          action,
          message: action === 'skip' ? null : sampleCandidateDetail.actionPlan?.message,
        },
      });

      render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

      expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '单点沟通' })).not.toBeInTheDocument();
    },
  );

  it('does not offer single-candidate communication without a planned chat log', async () => {
    fetchJdCandidateDetailMock.mockResolvedValueOnce({
      ...sampleCandidateDetail,
      latestPlannedChatRunId: null,
      actionLogs: [],
    });

    render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '单点沟通' })).not.toBeInTheDocument();
  });

  it.each(['filled', 'offline'] as const)(
    'does not offer single-candidate communication when the JD is %s',
    async (status) => {
      fetchJobDescriptionMock.mockResolvedValueOnce({
        ...sampleJobDescription,
        status,
      });

      render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

      expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '单点沟通' })).not.toBeInTheDocument();
    },
  );

  it.each(['running', 'success', 'failed', 'skipped'] as const)(
    'does not offer single-candidate communication when its chat log is %s',
    async (status) => {
      fetchJdCandidateDetailMock.mockResolvedValueOnce({
        ...sampleCandidateDetail,
        latestPlannedChatRunId: null,
        actionLogs: sampleCandidateDetail.actionLogs.map((actionLog) => ({
          ...actionLog,
          status,
        })),
      });

      render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

      expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '单点沟通' })).not.toBeInTheDocument();
    },
  );

  it.each(['onboarded', 'not_joined', 'rejected', 'withdrawn'] as const)(
    'does not offer single-candidate communication in terminal stage %s',
    async (interviewStage) => {
      fetchJdCandidateDetailMock.mockResolvedValueOnce({
        ...sampleCandidateDetail,
        interviewStage,
      });

      render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

      expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '单点沟通' })).not.toBeInTheDocument();
    },
  );

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

  it('candidate detail summarizes interview status and links to the interview detail', async () => {
    render(<CandidateDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByText('面试状态')).toBeInTheDocument();
    expect(screen.getByText('待联系')).toBeInTheDocument();
    expect(screen.getByText('已完成 1 / 4 轮评价')).toBeInTheDocument();
    expect(screen.getByText('电话沟通待评价')).toBeInTheDocument();
    expect(screen.getByText('一面已评价')).toBeInTheDocument();
    expect(screen.queryByLabelText('面试阶段')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('一面面试官')).not.toBeInTheDocument();

    const interviewLink = screen.getByRole('button', { name: '查看面试详情' });
    const interviewHref = interviewLink.getAttribute('href') ?? '';
    expect(parsedHref(interviewHref).pathname).toBe(
      '/jd-generator/jd-1/candidates/cand-1/interview',
    );
    expectReturnContext(interviewHref, '/jd-generator/jd-1/candidates/cand-1', '返回候选人详情');
  });

  it('interview detail updates interview stage', async () => {
    updateJdCandidateProgressMock.mockResolvedValueOnce({
      ...sampleCandidateListItem,
      interviewStage: 'contacted',
      notes: '已发送邀约',
    });
    render(<CandidateInterviewDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    const stageSelect = await screen.findByLabelText('面试阶段');
    fireEvent.change(stageSelect, { target: { value: 'contacted' } });
    fireEvent.change(screen.getByLabelText('候选人备注'), { target: { value: '已发送邀约' } });
    fireEvent.click(screen.getByRole('button', { name: '保存进度' }));

    await waitFor(() =>
      expect(updateJdCandidateProgressMock).toHaveBeenCalledWith('jd-1', 'cand-1', {
        interviewStage: 'contacted',
        notes: '已发送邀约',
      }),
    );

    const progressRegion = screen.getByLabelText('当前候选人进度');
    expect(within(progressRegion).getByText('已联系')).toBeInTheDocument();
  });

  it('interview detail records the outcome after an offer', async () => {
    fetchJdCandidateDetailMock.mockResolvedValueOnce({
      ...sampleCandidateDetail,
      interviewStage: 'offer',
    });
    updateJdCandidateProgressMock.mockResolvedValueOnce({
      ...sampleCandidateListItem,
      interviewStage: 'onboarded',
    });
    fetchJobDescriptionMock.mockResolvedValueOnce(sampleJobDescription).mockResolvedValueOnce({
      ...sampleJobDescription,
      status: 'filled',
      hiringTarget: 1,
      onboardedCount: 1,
    });

    render(<CandidateInterviewDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    const stageSelect = await screen.findByLabelText('面试阶段');
    expect(within(stageSelect).getByRole('option', { name: '已入职' })).toHaveValue('onboarded');
    expect(within(stageSelect).getByRole('option', { name: '未入职' })).toHaveValue('not_joined');
    fireEvent.change(stageSelect, { target: { value: 'onboarded' } });
    fireEvent.click(screen.getByRole('button', { name: '保存进度' }));

    await waitFor(() =>
      expect(updateJdCandidateProgressMock).toHaveBeenCalledWith('jd-1', 'cand-1', {
        interviewStage: 'onboarded',
        notes: sampleCandidateDetail.notes ?? '',
      }),
    );
    expect(within(screen.getByLabelText('当前候选人进度')).getByText('已入职')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '已达到招聘目标（已入职 1 / 目标 1），JD 已更新为“已招满”。',
    );
    expect(screen.getByText('候选人最终结果已记录，无需再生成录用建议。')).toBeInTheDocument();
    expect(screen.queryByText('录用建议')).not.toBeInTheDocument();
  });

  it.each([
    ['rejected', '候选人已淘汰，流程已结束，无需再生成录用建议。'],
    ['withdrawn', '候选人已退出，流程已结束，无需再生成录用建议。'],
  ] as const)(
    'interview detail explains terminal stage %s and hides hiring recommendations',
    async (interviewStage, terminalMessage) => {
      fetchJdCandidateDetailMock.mockResolvedValueOnce({
        ...sampleCandidateDetail,
        interviewStage,
      });

      render(<CandidateInterviewDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

      expect(await screen.findByText(terminalMessage)).toBeInTheDocument();
      expect(screen.queryByText('录用建议')).not.toBeInTheDocument();
    },
  );

  it('interview detail repairs a replied candidate with a stale contacted stage', async () => {
    fetchJdCandidateDetailMock.mockResolvedValueOnce({
      ...sampleCandidateDetail,
      interviewStage: 'contacted',
      candidate: {
        ...sampleCandidateDetail.candidate,
        replied: true,
      },
    });
    updateJdCandidateProgressMock.mockResolvedValueOnce({
      ...sampleCandidateListItem,
      interviewStage: 'replied',
    });

    render(<CandidateInterviewDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByText('检测到候选人已经回复')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '同步为已回复' }));

    await waitFor(() =>
      expect(updateJdCandidateProgressMock).toHaveBeenCalledWith('jd-1', 'cand-1', {
        interviewStage: 'replied',
        notes: sampleCandidateDetail.notes ?? '',
      }),
    );
    expect(screen.queryByText('检测到候选人已经回复')).not.toBeInTheDocument();
  });

  it('interview detail collects a structured phone screen evaluation', async () => {
    fetchJdCandidateDetailMock.mockResolvedValueOnce({
      ...sampleCandidateDetail,
      interviewStage: 'phone_screen',
    });
    fetchCandidateInterviewFeedbacksMock.mockResolvedValueOnce([]);
    saveCandidateInterviewFeedbackMock.mockResolvedValueOnce(samplePhoneScreenFeedback);

    render(<CandidateInterviewDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByText('继续评价 · 电话沟通')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('电话沟通面试官'), {
      target: { value: 'Katherine Johnson' },
    });
    fireEvent.change(screen.getByLabelText('电话沟通动机与角色契合评分'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText('电话沟通动机与角色契合证据'), {
      target: { value: '候选人能清楚说明求职动机和岗位关注点' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存电话沟通' }));

    await waitFor(() =>
      expect(saveCandidateInterviewFeedbackMock).toHaveBeenCalledWith(
        'jd-1',
        'cand-1',
        expect.objectContaining({
          stage: 'phone_screen',
          interviewer: 'Katherine Johnson',
          rating: 4,
          dimensionRatings: [
            {
              dimension: 'motivation',
              score: 4,
              evidence: '候选人能清楚说明求职动机和岗位关注点',
            },
          ],
        }),
      ),
    );
  });

  it('uses the JD interview process and saves the next-round interviewer before feedback', async () => {
    fetchJobDescriptionMock.mockResolvedValueOnce({
      ...sampleJobDescription,
      interviewProcess: {
        id: 'engineering',
        positionType: '技术岗位',
        stages: [
          {
            id: 'technical',
            name: '技术面',
            purpose: '验证专业能力与问题解决方法',
            sortOrder: 0,
          },
          {
            id: 'manager',
            name: '主管面',
            purpose: '确认岗位动机与协作方式',
            sortOrder: 1,
          },
        ],
      },
    });
    fetchJdCandidateDetailMock.mockResolvedValueOnce({
      ...sampleCandidateDetail,
      interviewStage: 'interviewing',
      interviewAssignments: [],
    });
    fetchCandidateInterviewFeedbacksMock.mockResolvedValueOnce([samplePhoneScreenFeedback]);
    updateJdCandidateProgressMock.mockResolvedValueOnce({
      ...sampleCandidateListItem,
      interviewStage: 'interviewing',
      interviewAssignments: [{ stage: 'technical', interviewer: 'Ada Lovelace' }],
    });

    render(<CandidateInterviewDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByText('下一轮安排 · 技术面')).toBeInTheDocument();
    expect(screen.getAllByText('验证专业能力与问题解决方法').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('下一轮面试官'), {
      target: { value: 'Ada Lovelace' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存面试安排' }));

    await waitFor(() =>
      expect(updateJdCandidateProgressMock).toHaveBeenCalledWith('jd-1', 'cand-1', {
        interviewAssignments: [{ stage: 'technical', interviewer: 'Ada Lovelace' }],
      }),
    );
    expect(screen.getByLabelText('技术面面试官')).toHaveValue('Ada Lovelace');
  });

  it('interview detail closes pending evaluation after leaving the interviewing stage', async () => {
    fetchJdCandidateDetailMock.mockResolvedValueOnce({
      ...sampleCandidateDetail,
      interviewStage: 'interviewing',
    });
    updateJdCandidateProgressMock.mockResolvedValueOnce({
      ...sampleCandidateListItem,
      interviewStage: 'rejected',
      notes: '面试未通过',
    });
    fetchCandidateInterviewFeedbacksMock.mockResolvedValueOnce([
      samplePhoneScreenFeedback,
      sampleFeedback,
    ]);

    render(<CandidateInterviewDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByLabelText('二面面试官')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('面试阶段'), { target: { value: 'rejected' } });
    fireEvent.click(screen.getByRole('button', { name: '保存进度' }));

    await waitFor(() => expect(screen.queryByLabelText('二面面试官')).not.toBeInTheDocument());
    expect(screen.getByText('当前阶段评价已完成')).toBeInTheDocument();
  });

  it('interview detail shows completed feedback and continues the next evaluation', async () => {
    fetchJdCandidateDetailMock.mockResolvedValueOnce({
      ...sampleCandidateDetail,
      interviewStage: 'interviewing',
    });
    saveCandidateInterviewFeedbackMock.mockResolvedValueOnce({
      ...sampleFeedback,
      id: 'feedback-2',
      stage: 'second_interview',
      interviewer: 'Alan Turing',
      rating: 5,
      pros: ['系统设计扎实', '沟通清晰'],
      cons: ['需要补充管理经验'],
      decision: 'pass',
      notes: '建议推进终面',
    });
    fetchCandidateInterviewFeedbacksMock.mockResolvedValueOnce([
      samplePhoneScreenFeedback,
      sampleFeedback,
    ]);

    render(<CandidateInterviewDetail jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByText('一面')).toBeInTheDocument();
    expect(screen.getByText(/Grace Hopper/)).toBeInTheDocument();
    expect(screen.getByText('继续评价 · 二面')).toBeInTheDocument();
    expect(screen.queryByLabelText('一面面试官')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('二面面试官'), {
      target: { value: 'Alan Turing' },
    });
    fireEvent.change(screen.getByLabelText('二面核心任务胜任力评分'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('二面核心任务胜任力证据'), {
      target: { value: '独立完成核心系统方案并解释关键实现' },
    });
    fireEvent.change(screen.getByLabelText('二面优势'), {
      target: { value: '系统设计扎实\n沟通清晰' },
    });
    fireEvent.change(screen.getByLabelText('二面不足'), {
      target: { value: '需要补充管理经验' },
    });
    fireEvent.change(screen.getByLabelText('二面结论'), { target: { value: 'pass' } });
    fireEvent.change(screen.getByLabelText('二面备注'), {
      target: { value: '建议推进终面' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存二面' }));

    await waitFor(() =>
      expect(saveCandidateInterviewFeedbackMock).toHaveBeenCalledWith('jd-1', 'cand-1', {
        stage: 'second_interview',
        interviewer: 'Alan Turing',
        rating: 5,
        dimensionRatings: [
          {
            dimension: 'core_competency',
            score: 5,
            evidence: '独立完成核心系统方案并解释关键实现',
          },
        ],
        pros: ['系统设计扎实', '沟通清晰'],
        cons: ['需要补充管理经验'],
        decision: 'pass',
        notes: '建议推进终面',
      }),
    );

    const decisionLink = screen.getByRole('button', { name: '生成阶段性建议' });
    expect(parsedHref(decisionLink.getAttribute('href') ?? '').pathname).toBe(
      '/jd-generator/jd-1/candidates/cand-1/interview/decision',
    );
    expect(evaluateJdCandidateDecisionMock).not.toHaveBeenCalled();
  });

  it('decision run shows execution logs, the final recommendation, and a back link', async () => {
    const completeFeedbacks: CandidateInterviewFeedbackDto[] = [
      samplePhoneScreenFeedback,
      sampleFeedback,
      { ...sampleFeedback, id: 'feedback-2', stage: 'second_interview' },
      { ...sampleFeedback, id: 'feedback-final', stage: 'final_interview' },
    ];
    fetchCandidateInterviewFeedbacksMock.mockResolvedValueOnce(completeFeedbacks);
    evaluateJdCandidateDecisionMock.mockResolvedValueOnce({
      ...sampleDecisionResult,
      decisionScope: 'final',
      missingFeedbackStages: [],
    });

    render(<CandidateDecisionRun jobDescriptionId="jd-1" candidateId="cand-1" />);

    expect(await screen.findByText('录用建议执行日志')).toBeInTheDocument();
    expect(await screen.findByText('录用建议生成完成')).toBeInTheDocument();
    expect(screen.getByText('岗位上下文')).toBeInTheDocument();
    expect(screen.getByText('高级后端工程师')).toBeInTheDocument();
    expect(screen.getByText('评价证据上下文')).toBeInTheDocument();
    expect(screen.getByText(/一面 · 4\/5 · 通过/)).toBeInTheDocument();
    expect(screen.getByText('维度评分与公式')).toBeInTheDocument();
    expect(screen.getAllByText('核心任务胜任力').length).toBeGreaterThan(0);
    expect(screen.getAllByText('复杂问题解决与专业判断').length).toBeGreaterThan(0);
    expect(screen.getAllByText('动机与角色契合').length).toBeGreaterThan(0);
    expect(screen.getByText('最终录用建议')).toBeInTheDocument();
    expect(screen.getByText('建议录用')).toBeInTheDocument();
    expect(screen.getByText('接受 Offer 概率')).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
    expect(screen.getByText('先确认薪资预期再发 offer')).toBeInTheDocument();

    const backLinks = screen.getAllByRole('button', { name: '返回面试详情' });
    expect(backLinks).toHaveLength(2);
    for (const backLink of backLinks) {
      expect(parsedHref(backLink.getAttribute('href') ?? '').pathname).toBe(
        '/jd-generator/jd-1/candidates/cand-1/interview',
      );
    }
  });
});
