import { evaluateCandidateHiringDecision } from './hiring-decision';
import type { CandidateInterviewFeedbackDto, CandidateScreeningDetailDto } from './repo';
import type { JobDescriptionDto, JD } from '@/types';

const now = '2026-07-01T00:00:00.000Z';

const jdContent: JD = {
  title: '高级后端工程师',
  summary: '负责招聘系统核心服务',
  responsibilities: ['建设 Java 微服务', '优化高并发招聘链路'],
  requirements: ['Java', 'Spring Boot', '分布式系统'],
  bonus: ['招聘 SaaS 经验'],
  highlights: ['技术成长空间大'],
};

const jobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '高级后端工程师',
  positionDescription: '负责 Java 微服务和分布式系统',
  tone: 'tech',
  status: 'published',
  content: jdContent,
  evaluation: null,
  generationMeta: null,
  createdAt: now,
  updatedAt: now,
};

const candidateDetail: CandidateScreeningDetailDto = {
  id: 'result-1',
  userId: 'u1',
  runId: 'run-1',
  jobDescriptionId: 'jd-1',
  candidateId: 'cand-1',
  resumeId: 'resume-1',
  source: 'both',
  tags: {
    skills: ['Java', 'Spring Boot'],
    domainKnowledge: ['招聘 SaaS'],
    generalAbility: ['owner'],
    risk: [],
    activity: ['active'],
    custom: [],
  },
  scoreDetail: {
    skill: 92,
    domain: 86,
    ability: 88,
    risk: 8,
    llmBonus: 4,
    total: 91,
  },
  finalScore: 91,
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
  actionStatus: 'success',
  interviewStage: 'interviewing',
  notes: '候选人回复积极，期望薪资可谈',
  createdAt: now,
  updatedAt: now,
  candidate: {
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
    contacted: true,
    replied: true,
    lastContactAt: now,
    createdAt: now,
    updatedAt: now,
  },
  resume: {
    id: 'resume-1',
    userId: 'u1',
    candidateId: 'cand-1',
    sourcePlatform: 'boss-like',
    profileUrl: 'https://boss-like.test/employer/resumes/cand-1',
    rawText: '8 年 Java Spring Boot 微服务经验，做过招聘 SaaS 和高并发系统。',
    structuredSummary: { skills: ['Java', 'Spring Boot', '微服务'], years: 8 },
    resumeHash: 'resume-hash-1',
    fetchedAt: now,
    createdAt: now,
  },
  actionLogs: [],
};

function feedback(
  stage: CandidateInterviewFeedbackDto['stage'],
  rating: number,
  decision: CandidateInterviewFeedbackDto['decision'] = 'pass',
): CandidateInterviewFeedbackDto {
  return {
    id: `feedback-${stage}`,
    userId: 'u1',
    jobDescriptionId: 'jd-1',
    candidateId: 'cand-1',
    stage,
    interviewer: 'Grace Hopper',
    rating,
    pros: ['技术深度扎实', '能清楚解释系统取舍'],
    cons: decision === 'reject' ? ['终面认为团队协作风险偏高'] : [],
    decision,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('evaluateCandidateHiringDecision', () => {
  it('recommends strong_yes when JD match, responsiveness, and all interview rounds are strong', () => {
    const result = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: candidateDetail,
      interviewFeedbacks: [
        feedback('first_interview', 4),
        feedback('second_interview', 5),
        feedback('final_interview', 4),
      ],
    });

    expect(result.hireDecision).toBe('strong_yes');
    expect(result.features.skillMatchScore).toBeGreaterThanOrEqual(0.85);
    expect(result.features.interviewScore).toBeCloseTo(0.87, 2);
    expect(result.features.intentLevel).toBe('high');
    expect(result.offerAcceptProbability).toBeGreaterThan(0.65);
    expect(result.riskAnalysis.level).toBe('low');
    expect(result.strengths).toEqual(
      expect.arrayContaining(['Java', 'Spring Boot', '技术深度扎实']),
    );
    expect(result.suggestions.map((item) => item.content).join('\n')).toContain('offer');
  });

  it('rejects the candidate when interview feedback fails the hard filter', () => {
    const result = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: candidateDetail,
      interviewFeedbacks: [
        feedback('first_interview', 2, 'hold'),
        feedback('second_interview', 2, 'hold'),
        feedback('final_interview', 1, 'reject'),
      ],
    });

    expect(result.hireDecision).toBe('no');
    expect(result.confidence).toBeGreaterThan(0.65);
    expect(result.riskAnalysis.level).toBe('high');
    expect(result.riskAnalysis.reasons).toEqual(
      expect.arrayContaining(['面试综合评分低于录用线', '终面结论为 reject']),
    );
    expect(result.weaknesses).toEqual(expect.arrayContaining(['终面认为团队协作风险偏高']));
    expect(result.suggestions.map((item) => item.content).join('\n')).toContain('不要直接发 offer');
  });
});
