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
  salaryRange: null,
  workLocations: [],
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
    dimensionRatings: [
      { dimension: 'core_competency', score: rating, evidence: '完成过同类核心任务' },
      { dimension: 'problem_solving', score: rating, evidence: '能解释方案判断与关键取舍' },
      { dimension: 'impact', score: rating, evidence: '明确说明个人贡献和项目结果' },
      { dimension: 'collaboration', score: rating, evidence: '能推动跨团队协作' },
      { dimension: 'motivation', score: rating, evidence: '岗位动机和发展方向明确' },
    ],
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
        feedback('phone_screen', 4),
        feedback('first_interview', 4),
        feedback('second_interview', 5),
        feedback('final_interview', 4),
      ],
    });

    expect(result.hireDecision).toBe('strong_yes');
    expect(result.decisionScope).toBe('final');
    expect(result.missingFeedbackStages).toEqual([]);
    expect(result.features.skillMatchScore).toBeGreaterThanOrEqual(0.85);
    expect(result.features.interviewScore).toBeCloseTo(0.85, 2);
    expect(result.features.intentLevel).toBe('high');
    expect(result.decisionTrace.formula.map((item) => item.key)).toEqual([
      'core_competency',
      'problem_solving',
      'impact',
      'collaboration',
      'motivation',
    ]);
    expect(result.decisionTrace.formula.find((item) => item.key === 'core_competency')).toEqual(
      expect.objectContaining({ weight: 0.35 }),
    );
    expect(result.dimensionAssessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'core_competency', label: '核心任务胜任力' }),
        expect.objectContaining({ key: 'problem_solving', label: '复杂问题解决与专业判断' }),
        expect.objectContaining({ key: 'impact', label: '成果与业务影响力' }),
        expect.objectContaining({ key: 'collaboration', label: '协作、推动与责任感' }),
        expect.objectContaining({ key: 'motivation', label: '动机与角色契合' }),
        expect.objectContaining({ key: 'risk', label: '风险健康度' }),
      ]),
    );
    expect(result.offerAcceptProbability).toBeGreaterThan(0.65);
    expect(result.riskAnalysis.level).toBe('low');
    expect(result.strengths).toEqual(
      expect.arrayContaining([
        expect.stringContaining('核心任务胜任力'),
        expect.stringContaining('复杂问题解决与专业判断'),
        expect.stringContaining('成果与业务影响力'),
        expect.stringContaining('协作、推动与责任感'),
        expect.stringContaining('动机与角色契合'),
      ]),
    );
    expect(result.strengths).not.toContain('Java');
    expect(result.suggestions.map((item) => item.content).join('\n')).toContain('offer');
  });

  it('uses interview evidence to infer intent and responsiveness', () => {
    const result = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: {
        ...candidateDetail,
        notes: null,
        candidate: { ...candidateDetail.candidate, replied: false },
      },
      interviewFeedbacks: [
        {
          ...feedback('phone_screen', 4),
          pros: ['岗位意愿明确', '沟通响应及时'],
          notes: '候选人希望尽快推进后续面试',
        },
      ],
    });

    expect(result.features.intentLevel).toBe('high');
    expect(result.features.responsiveness).toBeGreaterThanOrEqual(0.75);
    expect(result.dimensionAssessments.find((item) => item.key === 'motivation')?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining('岗位意愿明确')]),
    );
  });

  it('uses structured interview evidence to corroborate a resume-based competency score', () => {
    const resumeOnly = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: {
        ...candidateDetail,
        scoreDetail: { ...candidateDetail.scoreDetail, skill: 70 },
      },
      interviewFeedbacks: [],
    });
    const corroborated = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: {
        ...candidateDetail,
        scoreDetail: { ...candidateDetail.scoreDetail, skill: 70 },
      },
      interviewFeedbacks: [feedback('first_interview', 5)],
    });

    const resumeOnlyCore = resumeOnly.dimensionAssessments.find(
      (item) => item.key === 'core_competency',
    );
    const corroboratedCore = corroborated.dimensionAssessments.find(
      (item) => item.key === 'core_competency',
    );
    expect(corroboratedCore?.score).toBeGreaterThan(resumeOnlyCore?.score ?? 0);
    expect(corroboratedCore?.confidence).toBeGreaterThan(resumeOnlyCore?.confidence ?? 0);
    expect(corroboratedCore?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining('完成过同类核心任务')]),
    );
  });

  it('keeps responsiveness out of the hiring score and uses it only for offer probability', () => {
    const feedbacks = [
      feedback('phone_screen', 4),
      feedback('first_interview', 4),
      feedback('second_interview', 4),
      feedback('final_interview', 4),
    ];
    const replied = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: candidateDetail,
      interviewFeedbacks: feedbacks,
    });
    const notMarkedReplied = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: {
        ...candidateDetail,
        candidate: { ...candidateDetail.candidate, replied: false },
      },
      interviewFeedbacks: feedbacks,
    });

    expect(notMarkedReplied.decisionTrace.weightedScore).toBe(replied.decisionTrace.weightedScore);
    expect(notMarkedReplied.decisionTrace.formula.map((item) => item.key)).not.toContain(
      'responsiveness',
    );
    expect(notMarkedReplied.offerAcceptProbability).toBeLessThanOrEqual(
      replied.offerAcceptProbability,
    );
  });

  it('does not treat a reply by itself as evidence of role motivation', () => {
    const replied = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: {
        ...candidateDetail,
        notes: null,
        candidate: { ...candidateDetail.candidate, replied: true },
      },
      interviewFeedbacks: [],
    });
    const notReplied = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: {
        ...candidateDetail,
        notes: null,
        candidate: { ...candidateDetail.candidate, replied: false },
      },
      interviewFeedbacks: [],
    });

    expect(replied.dimensionAssessments.find((item) => item.key === 'motivation')?.score).toBe(
      notReplied.dimensionAssessments.find((item) => item.key === 'motivation')?.score,
    );
    expect(replied.offerAcceptProbability).toBeGreaterThan(notReplied.offerAcceptProbability);
  });

  it('does not treat responsive communication wording as role motivation', () => {
    const responsive = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: { ...candidateDetail, notes: '候选人回复积极，沟通响应及时' },
      interviewFeedbacks: [],
    });
    const neutral = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: { ...candidateDetail, notes: null },
      interviewFeedbacks: [],
    });

    expect(responsive.dimensionAssessments.find((item) => item.key === 'motivation')?.score).toBe(
      neutral.dimensionAssessments.find((item) => item.key === 'motivation')?.score,
    );
  });

  it('does not infer business impact from years of experience alone', () => {
    const junior = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: {
        ...candidateDetail,
        candidate: { ...candidateDetail.candidate, experienceYears: 1 },
        resume: candidateDetail.resume
          ? { ...candidateDetail.resume, structuredSummary: { years: 1 } }
          : null,
      },
      interviewFeedbacks: [],
    });
    const senior = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: {
        ...candidateDetail,
        candidate: { ...candidateDetail.candidate, experienceYears: 15 },
        resume: candidateDetail.resume
          ? { ...candidateDetail.resume, structuredSummary: { years: 15 } }
          : null,
      },
      interviewFeedbacks: [],
    });

    expect(junior.dimensionAssessments.find((item) => item.key === 'impact')?.score).toBe(
      senior.dimensionAssessments.find((item) => item.key === 'impact')?.score,
    );
  });

  it('lets strong interview evidence corroborate a low resume screening score', () => {
    const result = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: {
        ...candidateDetail,
        scoreDetail: { ...candidateDetail.scoreDetail, skill: 30 },
      },
      interviewFeedbacks: [
        feedback('phone_screen', 5),
        feedback('first_interview', 5),
        feedback('second_interview', 5),
        feedback('final_interview', 5),
      ],
    });

    expect(result.decisionTrace.hardRejected).toBe(false);
    expect(result.hireDecision).not.toBe('no');
    expect(
      result.dimensionAssessments.find((item) => item.key === 'core_competency')?.score,
    ).toBeGreaterThanOrEqual(0.8);
    expect(result.riskAnalysis.reasons).not.toContain('核心任务胜任力低于录用线');
  });

  it('rejects the candidate when interview feedback fails the hard filter', () => {
    const result = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: candidateDetail,
      interviewFeedbacks: [
        feedback('phone_screen', 3, 'hold'),
        feedback('first_interview', 2, 'hold'),
        feedback('second_interview', 2, 'hold'),
        feedback('final_interview', 1, 'reject'),
      ],
    });

    expect(result.hireDecision).toBe('no');
    expect(result.confidence).toBeGreaterThan(0.65);
    expect(result.riskAnalysis.level).toBe('high');
    expect(result.riskAnalysis.reasons).toEqual(expect.arrayContaining(['终面结论为 reject']));
    expect(result.weaknesses).toEqual(expect.arrayContaining(['终面认为团队协作风险偏高']));
    expect(result.suggestions.map((item) => item.content).join('\n')).toContain('不要直接发 offer');
  });

  it('marks an incomplete interview set as a preliminary decision', () => {
    const result = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: candidateDetail,
      interviewFeedbacks: [feedback('phone_screen', 4), feedback('first_interview', 4)],
    });

    expect(result.decisionScope).toBe('preliminary');
    expect(result.missingFeedbackStages).toEqual(['second_interview', 'final_interview']);
    expect(result.suggestions.map((item) => item.content).join('\n')).toContain('补齐');
  });

  it('does not strongly recommend when one weighted competency is below the dimension floor', () => {
    const feedbacks = [
      feedback('phone_screen', 5),
      feedback('first_interview', 5),
      feedback('second_interview', 5),
      feedback('final_interview', 5),
    ].map((item) => ({
      ...item,
      dimensionRatings: item.dimensionRatings.map((rating) =>
        rating.dimension === 'impact' ? { ...rating, score: 2 } : rating,
      ),
    }));

    const result = evaluateCandidateHiringDecision({
      jobDescription,
      candidate: candidateDetail,
      interviewFeedbacks: feedbacks,
    });

    expect(result.decisionTrace.weightedScore).toBeGreaterThanOrEqual(0.82);
    expect(result.dimensionAssessments.find((item) => item.key === 'impact')?.score).toBeLessThan(
      0.6,
    );
    expect(result.hireDecision).toBe('yes');
  });
});
