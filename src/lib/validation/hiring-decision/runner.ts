import { evaluateCandidateHiringDecision } from '@/lib/candidate-screening/hiring-decision';
import type {
  CandidateInterviewFeedbackDto,
  CandidateScreeningDetailDto,
} from '@/lib/candidate-screening/repo';
import type { JobDescriptionDto, JD } from '@/types';
import { assertHiringDecisionSample } from './assert';
import { HIRING_DECISION_DATASET_SAMPLES, type HiringDecisionGoldenSample } from './dataset';

const now = '2026-01-01T00:00:00.000Z';

function buildInput(sample: HiringDecisionGoldenSample) {
  const content: JD = {
    title: sample.input.job.title,
    summary: sample.input.job.description,
    responsibilities: [sample.input.job.description],
    requirements: sample.input.job.requirements,
    bonus: [],
    highlights: [],
  };
  const jobDescription: JobDescriptionDto = {
    id: `jd-${sample.id}`,
    userId: 'validation-user',
    department: '验证集',
    position: sample.input.job.title,
    positionDescription: `${sample.input.job.description}，${sample.input.job.requiredYears} 年经验`,
    salaryRange: null,
    workLocations: [],
    tone: 'tech',
    status: 'published',
    content,
    evaluation: null,
    generationMeta: null,
    createdAt: now,
    updatedAt: now,
  };
  const candidate: CandidateScreeningDetailDto = {
    id: `result-${sample.id}`,
    userId: 'validation-user',
    runId: 'validation-run',
    jobDescriptionId: jobDescription.id,
    candidateId: `candidate-${sample.id}`,
    resumeId: `resume-${sample.id}`,
    source: 'live_search',
    tags: {
      skills: sample.input.candidate.skills,
      domainKnowledge: sample.input.candidate.domainKnowledge,
      generalAbility: sample.input.candidate.generalAbility,
      risk: sample.input.candidate.risks,
      activity: [],
      custom: [],
    },
    scoreDetail: {
      skill: sample.input.candidate.skillScore,
      domain: sample.input.candidate.skillScore,
      ability: sample.input.candidate.skillScore,
      risk: sample.input.candidate.risks.length > 0 ? 40 : 0,
      llmBonus: 0,
      total: sample.input.candidate.skillScore,
    },
    finalScore: sample.input.candidate.skillScore,
    rank: 1,
    decisionAction: 'chat',
    decisionPriority: 'high',
    decisionReason: 'validation fixture',
    actionPlan: null,
    actionStatus: sample.input.candidate.contacted ? 'success' : 'planned',
    interviewStage: 'interviewing',
    notes: sample.input.candidate.notes,
    createdAt: now,
    updatedAt: now,
    candidate: {
      id: `candidate-${sample.id}`,
      userId: 'validation-user',
      displayName: sample.label,
      currentTitle: sample.input.job.title,
      currentCompany: 'Validation Co.',
      location: '上海',
      experienceYears: sample.input.candidate.years,
      sourcePlatform: 'boss-like',
      platformCandidateId: sample.id,
      profileUrl: null,
      identityKey: sample.id,
      identityHash: sample.id,
      lastActiveAt: now,
      contacted: sample.input.candidate.contacted,
      replied: sample.input.candidate.replied,
      lastContactAt: sample.input.candidate.contacted ? now : null,
      createdAt: now,
      updatedAt: now,
    },
    resume: {
      id: `resume-${sample.id}`,
      userId: 'validation-user',
      candidateId: `candidate-${sample.id}`,
      sourcePlatform: 'boss-like',
      profileUrl: null,
      rawText: `${sample.input.candidate.years} 年 ${sample.input.candidate.skills.join(' ')} ${sample.input.candidate.domainKnowledge.join(' ')}`,
      structuredSummary: { years: sample.input.candidate.years },
      resumeHash: sample.id,
      fetchedAt: now,
      createdAt: now,
    },
    actionLogs: [],
  };
  const feedbacks: CandidateInterviewFeedbackDto[] = sample.input.feedbacks.map(
    (feedback, index) => ({
      id: `${sample.id}-${feedback.stage}`,
      userId: 'validation-user',
      jobDescriptionId: jobDescription.id,
      candidateId: candidate.candidateId,
      stage: feedback.stage,
      interviewer: `验证面试官 ${index + 1}`,
      rating: feedback.rating,
      dimensionRatings: feedback.dimensionRatings ?? [],
      pros: feedback.pros,
      cons: feedback.cons,
      decision: feedback.decision,
      notes: null,
      createdAt: now,
      updatedAt: now,
    }),
  );
  return { jobDescription, candidate, feedbacks };
}

export function runHiringDecisionGoldenDataset() {
  const samples = HIRING_DECISION_DATASET_SAMPLES.map((sample) => {
    const input = buildInput(sample);
    const decision = evaluateCandidateHiringDecision({
      jobDescription: input.jobDescription,
      candidate: input.candidate,
      interviewFeedbacks: input.feedbacks,
    });
    return { sample, decision, assertion: assertHiringDecisionSample(sample, decision) };
  });
  return {
    samples,
    passed: samples.filter((item) => item.assertion.ok).length,
    failed: samples.filter((item) => !item.assertion.ok).length,
  };
}
