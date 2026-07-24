import type { JobDescriptionDto, JD } from '@/types';
import type { CandidateInterviewFeedbackDto, CandidateScreeningDetailDto } from './repo';
import { CANDIDATE_EVALUATION_DIMENSIONS } from './evaluation-dimensions';
import { getInterviewStageLabel, getRequiredInterviewStages } from '@/lib/interviews/process';
import type { InterviewProcess } from '@/lib/interviews/types';
import type {
  CandidateDecisionIntentLevel,
  CandidateDecisionRiskLevel,
  CandidateEvaluationDimensionKey,
  CandidateHireDecision,
} from './types';

type DecisionRiskFlags = {
  salarySensitive: boolean;
  hasOtherOffers: boolean;
  lowStability: boolean;
};

export type CandidateDecisionFeaturesDto = {
  skillMatchScore: number;
  experienceMatch: number;
  interviewScore: number;
  intentLevel: CandidateDecisionIntentLevel;
  risks: DecisionRiskFlags;
  responsiveness: number;
};

export type CandidateDecisionDimensionKey = CandidateEvaluationDimensionKey | 'risk';

export type CandidateDecisionDimensionDto = {
  key: CandidateDecisionDimensionKey;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  confidence: number;
  status: 'strong' | 'acceptable' | 'concern';
  summary: string;
  evidence: string[];
};

export type CandidateDecisionTraceDto = {
  weightedScore: number;
  hardRejected: boolean;
  formula: Array<
    Pick<CandidateDecisionDimensionDto, 'key' | 'label' | 'score' | 'weight' | 'contribution'>
  >;
  thresholds: {
    strongYes: number;
    strongYesDimensionFloor: number;
    yes: number;
    preliminaryYes: number;
    hardRejectCoreCompetency: number;
  };
  feedbackCoverage: {
    completed: number;
    total: number;
  };
};

export type CandidateDecisionResultDto = {
  decisionScope: 'preliminary' | 'final';
  missingFeedbackStages: CandidateInterviewFeedbackDto['stage'][];
  hireDecision: CandidateHireDecision;
  confidence: number;
  offerAcceptProbability: number;
  generatedAt: string;
  features: CandidateDecisionFeaturesDto;
  dimensionAssessments: CandidateDecisionDimensionDto[];
  decisionTrace: CandidateDecisionTraceDto;
  riskAnalysis: {
    level: CandidateDecisionRiskLevel;
    reasons: string[];
  };
  strengths: string[];
  weaknesses: string[];
  suggestions: Array<{
    type: 'action';
    content: string;
  }>;
};

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(flattenStrings);
  }
  return [];
}

function getJdKeywords(jobDescription: JobDescriptionDto): string[] {
  const content = jobDescription.content as JD;
  return unique([
    jobDescription.position,
    jobDescription.positionDescription,
    ...flattenStrings(content.requirements),
    ...flattenStrings(content.responsibilities),
    ...flattenStrings(content.bonus),
    ...flattenStrings(content.highlights),
  ]).filter((keyword) => keyword.length >= 2);
}

function getResumeText(candidate: CandidateScreeningDetailDto): string {
  return [
    candidate.resume?.rawText,
    candidate.candidate.currentTitle,
    candidate.candidate.currentCompany,
    ...candidate.tags.skills,
    ...candidate.tags.domainKnowledge,
    ...candidate.tags.generalAbility,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
}

function calculateKeywordOverlap(jobDescription: JobDescriptionDto, candidateText: string): number {
  const keywords = getJdKeywords(jobDescription);
  if (keywords.length === 0) return 0.5;

  const normalizedText = normalize(candidateText);
  const matched = keywords.filter((keyword) => normalizedText.includes(normalize(keyword))).length;
  return clamp(matched / keywords.length);
}

function calculateSkillMatch(
  jobDescription: JobDescriptionDto,
  candidate: CandidateScreeningDetailDto,
): number {
  const screeningSkillScore = clamp(candidate.scoreDetail.skill / 100);
  const overlap = calculateKeywordOverlap(jobDescription, getResumeText(candidate));
  const blendedScore = screeningSkillScore * 0.7 + overlap * 0.3;
  return roundTwo(Math.max(screeningSkillScore, blendedScore));
}

function readResumeYears(candidate: CandidateScreeningDetailDto): number | null {
  const summary = candidate.resume?.structuredSummary;
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
    const years = (summary as { years?: unknown }).years;
    if (typeof years === 'number' && Number.isFinite(years)) return years;
  }
  return candidate.candidate.experienceYears;
}

function readRequiredYears(jobDescription: JobDescriptionDto): number {
  const text = [jobDescription.positionDescription, ...flattenStrings(jobDescription.content)].join(
    '\n',
  );
  const matches = [...text.matchAll(/(\d+)\s*(?:年|years?)/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  return matches.length > 0 ? Math.min(...matches) : 3;
}

function calculateExperienceMatch(
  jobDescription: JobDescriptionDto,
  candidate: CandidateScreeningDetailDto,
): number {
  const years = readResumeYears(candidate);
  if (years === null) return 0.55;
  return roundTwo(clamp(years / readRequiredYears(jobDescription)));
}

function calculateInterviewScore(feedbacks: CandidateInterviewFeedbackDto[]): number {
  if (feedbacks.length === 0) return 0.5;
  const total = feedbacks.reduce((sum, feedback) => sum + clamp(feedback.rating, 1, 5), 0);
  return roundTwo(total / feedbacks.length / 5);
}

const intentEvidencePattern =
  /岗位意愿|岗位动机|岗位理解|角色契合|发展方向|希望推进|愿意推进|对.{0,12}(?:岗位|职位|机会).{0,8}感兴趣/;

function getIntentEvidence(
  candidate: CandidateScreeningDetailDto,
  feedbacks: CandidateInterviewFeedbackDto[],
): string[] {
  return unique([
    ...(candidate.candidate.replied ? ['候选人已回复招聘沟通'] : []),
    candidate.notes ?? '',
    ...feedbacks.flatMap((feedback) => [...feedback.pros, feedback.notes ?? '']),
  ]).filter((item) => intentEvidencePattern.test(item));
}

function inferIntentLevel(
  candidate: CandidateScreeningDetailDto,
  feedbacks: CandidateInterviewFeedbackDto[],
): CandidateDecisionIntentLevel {
  if (candidate.candidate.replied || getIntentEvidence(candidate, feedbacks).length > 0) {
    return 'high';
  }
  if (
    candidate.candidate.contacted ||
    candidate.actionStatus === 'success' ||
    feedbacks.length > 0
  ) {
    return 'medium';
  }
  return 'low';
}

function calculateResponsiveness(
  candidate: CandidateScreeningDetailDto,
  feedbacks: CandidateInterviewFeedbackDto[],
): number {
  if (candidate.candidate.replied) return 0.9;
  if (feedbacks.length >= 3) return 0.85;
  if (feedbacks.length > 0) return 0.75;
  if (candidate.candidate.contacted || candidate.actionLogs.length > 0) return 0.6;
  return 0.4;
}

function collectEvidenceText(
  candidate: CandidateScreeningDetailDto,
  feedbacks: CandidateInterviewFeedbackDto[],
): string {
  return [
    candidate.notes,
    candidate.resume?.rawText,
    ...candidate.tags.risk,
    ...feedbacks.flatMap((feedback) => [...feedback.pros, ...feedback.cons, feedback.notes ?? '']),
  ].join('\n');
}

function detectRisks(
  candidate: CandidateScreeningDetailDto,
  feedbacks: CandidateInterviewFeedbackDto[],
): DecisionRiskFlags {
  const evidence = collectEvidenceText(candidate, feedbacks);
  return {
    salarySensitive: /薪资敏感|薪资要求高|薪资较高|salary sensitive|compensation concern/i.test(
      evidence,
    ),
    hasOtherOffers: /其他\s*offer|已有\s*offer|竞品\s*offer|other offers?/i.test(evidence),
    lowStability: /频繁跳槽|稳定性不足|稳定性风险|low stability/i.test(evidence),
  };
}

function getRiskReasons(params: {
  coreCompetencyScore: number;
  risks: DecisionRiskFlags;
  feedbacks: CandidateInterviewFeedbackDto[];
  interviewProcess: InterviewProcess | null | undefined;
}): string[] {
  const reasons: string[] = [];
  if (params.coreCompetencyScore < 0.4) reasons.push('核心任务胜任力低于录用线');
  reasons.push(
    ...params.feedbacks
      .filter((feedback) => feedback.decision === 'reject')
      .map(
        (feedback) =>
          `${getInterviewStageLabel(feedback.stage, params.interviewProcess)}结论为 reject`,
      ),
  );
  if (params.risks.salarySensitive) reasons.push('薪资敏感');
  if (params.risks.hasOtherOffers) reasons.push('存在其他 offer 风险');
  if (params.risks.lowStability) reasons.push('稳定性风险');
  return unique(reasons);
}

function getRiskLevel(reasons: string[], hardRejected: boolean): CandidateDecisionRiskLevel {
  if (hardRejected || reasons.length >= 3) return 'high';
  if (reasons.length > 0) return 'medium';
  return 'low';
}

function chooseHireDecision(params: {
  weightedScore: number;
  hardRejected: boolean;
  riskLevel: CandidateDecisionRiskLevel;
  feedbacks: CandidateInterviewFeedbackDto[];
  dimensions: CandidateDecisionDimensionDto[];
  requiredStageIds: string[];
}): CandidateHireDecision {
  if (params.hardRejected) return 'no';
  const completedStages = new Set(params.feedbacks.map((feedback) => feedback.stage));
  const feedbackComplete = params.requiredStageIds.every((stage) => completedStages.has(stage));
  const allCompetenciesAcceptable = params.dimensions
    .filter((dimension) => dimension.weight > 0)
    .every((dimension) => dimension.score >= 0.6);
  if (
    feedbackComplete &&
    allCompetenciesAcceptable &&
    params.weightedScore >= 0.82 &&
    params.riskLevel === 'low'
  ) {
    return 'strong_yes';
  }
  if (params.weightedScore >= (feedbackComplete ? 0.65 : 0.6)) return 'yes';
  return 'no';
}

function calculateConfidence(params: {
  dimensions: CandidateDecisionDimensionDto[];
  completedStageCount: number;
  requiredStageCount: number;
}): number {
  const feedbackCoverage = clamp(params.completedStageCount / params.requiredStageCount);
  const weightedConfidence = params.dimensions
    .filter((dimension) => dimension.weight > 0)
    .reduce((total, dimension) => total + dimension.confidence * dimension.weight, 0);
  const value = weightedConfidence * 0.8 + feedbackCoverage * 0.2;
  return roundTwo(clamp(value));
}

function calculateOfferAcceptProbability(params: {
  weightedScore: number;
  intentLevel: CandidateDecisionIntentLevel;
  responsiveness: number;
  risks: DecisionRiskFlags;
}): number {
  let probability =
    params.intentLevel === 'high' ? 0.78 : params.intentLevel === 'medium' ? 0.6 : 0.42;
  probability += params.responsiveness * 0.12;
  probability += (params.weightedScore - 0.65) * 0.2;
  if (params.risks.salarySensitive) probability -= 0.1;
  if (params.risks.hasOtherOffers) probability -= 0.18;
  if (params.risks.lowStability) probability -= 0.08;
  return roundTwo(clamp(probability, 0.05, 0.95));
}

function dimensionStatus(score: number): CandidateDecisionDimensionDto['status'] {
  if (score >= 0.8) return 'strong';
  if (score >= 0.6) return 'acceptable';
  return 'concern';
}

function createDimension(params: {
  key: CandidateDecisionDimensionKey;
  label: string;
  score: number;
  weight: number;
  confidence: number;
  summary: string;
  evidence: string[];
  status?: CandidateDecisionDimensionDto['status'];
}): CandidateDecisionDimensionDto {
  return {
    key: params.key,
    label: params.label,
    score: roundTwo(params.score),
    weight: params.weight,
    contribution: roundTwo(params.score * params.weight),
    confidence: roundTwo(params.confidence),
    status: params.status ?? dimensionStatus(params.score),
    summary: params.summary,
    evidence: unique(params.evidence).slice(0, 8),
  };
}

type DimensionEvidenceRating = {
  score: number;
  evidence: string;
  explicit: boolean;
};

const legacyDimensionEvidencePatterns: Record<CandidateEvaluationDimensionKey, RegExp> = {
  core_competency: /技术|专业|基础|能力|react|typescript|java|产品|设计|运营|销售/i,
  problem_solving: /问题|分析|判断|取舍|方案|设计|排查|复盘|优化|架构/i,
  impact: /成果|结果|指标|规模|增长|项目|负责|主导|影响|dau|营收/i,
  collaboration: /协作|沟通|推动|团队|跨团队|责任|主动|管理|协调/i,
  motivation: /意愿|动机|兴趣|发展|岗位理解|尽快推进|愿意推进/i,
};

function collectInterviewDimensionEvidence(
  dimension: CandidateEvaluationDimensionKey,
  feedbacks: CandidateInterviewFeedbackDto[],
  interviewProcess: InterviewProcess | null | undefined,
): DimensionEvidenceRating[] {
  return feedbacks.flatMap<DimensionEvidenceRating>((feedback) => {
    const explicitRating = feedback.dimensionRatings.find(
      (rating) => rating.dimension === dimension,
    );
    if (explicitRating) {
      return [
        {
          score: clamp(explicitRating.score / 5),
          evidence: `${getInterviewStageLabel(feedback.stage, interviewProcess)} ${explicitRating.score}/5 · ${explicitRating.evidence}`,
          explicit: true,
        },
      ];
    }

    const evidenceText = [...feedback.pros, ...feedback.cons, feedback.notes ?? '']
      .filter(Boolean)
      .join('、');
    if (!legacyDimensionEvidencePatterns[dimension].test(evidenceText)) return [];
    return [
      {
        score: clamp(feedback.rating / 5),
        evidence: `${getInterviewStageLabel(feedback.stage, interviewProcess)} ${feedback.rating}/5 · 历史评价推断：${evidenceText}`,
        explicit: false,
      },
    ];
  });
}

function combineDimensionEvidence(params: {
  baseScore: number;
  baseConfidence: number;
  interviewEvidence: DimensionEvidenceRating[];
}) {
  if (params.interviewEvidence.length === 0) {
    return { score: params.baseScore, confidence: params.baseConfidence };
  }

  const explicitCount = params.interviewEvidence.filter((item) => item.explicit).length;
  const inferredCount = params.interviewEvidence.length - explicitCount;
  const interviewScore =
    params.interviewEvidence.reduce((total, item) => total + item.score, 0) /
    params.interviewEvidence.length;
  const interviewWeight =
    explicitCount > 0
      ? Math.min(0.9, 0.65 + (explicitCount - 1) * 0.15)
      : Math.min(0.45, 0.25 + inferredCount * 0.05);
  return {
    score: params.baseScore * (1 - interviewWeight) + interviewScore * interviewWeight,
    confidence: clamp(params.baseConfidence + explicitCount * 0.2 + inferredCount * 0.06),
  };
}

function collaborationResumeEvidence(candidate: CandidateScreeningDetailDto) {
  const evidence = candidate.tags.generalAbility.filter((tag) =>
    /协作|沟通|推动|团队|责任|主动|管理|协调|owner/i.test(tag),
  );
  return {
    score: evidence.length > 0 ? 0.65 : 0.5,
    confidence: evidence.length > 0 ? 0.35 : 0.2,
    evidence: evidence.length > 0 ? evidence : ['简历尚缺少明确的协作与推动案例'],
  };
}

function buildDimensionAssessments(params: {
  candidate: CandidateScreeningDetailDto;
  feedbacks: CandidateInterviewFeedbackDto[];
  skillMatchScore: number;
  interviewProcess: InterviewProcess | null | undefined;
}): CandidateDecisionDimensionDto[] {
  const abilityScore = clamp(params.candidate.scoreDetail.ability / 100);
  const collaborationBase = collaborationResumeEvidence(params.candidate);
  const intentEvidence = getIntentEvidence(params.candidate, params.feedbacks);

  const baseByDimension: Record<
    CandidateEvaluationDimensionKey,
    { score: number; confidence: number; evidence: string[] }
  > = {
    core_competency: {
      score: params.skillMatchScore,
      confidence: params.candidate.resume ? 0.55 : 0.35,
      evidence: [
        `简历筛选技能分 ${params.candidate.scoreDetail.skill}/100`,
        ...params.candidate.tags.skills,
        ...params.candidate.tags.domainKnowledge,
      ],
    },
    problem_solving: {
      score: abilityScore,
      confidence: params.candidate.tags.generalAbility.length > 0 ? 0.4 : 0.25,
      evidence: [
        `简历通用能力分 ${params.candidate.scoreDetail.ability}/100`,
        ...params.candidate.tags.generalAbility,
      ],
    },
    impact: {
      score: 0.5,
      confidence: 0.2,
      evidence: ['工作年限和领域匹配不等同于成果影响力，需用具体项目结果验证'],
    },
    collaboration: collaborationBase,
    motivation: {
      score: intentEvidence.length > 0 ? 0.65 : 0.5,
      confidence: intentEvidence.length > 0 ? 0.4 : 0.2,
      evidence: intentEvidence.length > 0 ? intentEvidence : ['未发现明确的岗位动机证据'],
    },
  };

  const candidateDimensions = CANDIDATE_EVALUATION_DIMENSIONS.map((definition) => {
    const base = baseByDimension[definition.key];
    const interviewEvidence = collectInterviewDimensionEvidence(
      definition.key,
      params.feedbacks,
      params.interviewProcess,
    );
    const combined = combineDimensionEvidence({
      baseScore: base.score,
      baseConfidence: base.confidence,
      interviewEvidence,
    });
    return createDimension({
      key: definition.key,
      label: definition.label,
      score: combined.score,
      weight: definition.weight,
      confidence: combined.confidence,
      summary:
        interviewEvidence.length > 0
          ? `综合简历与 ${interviewEvidence.length} 条面试证据评估`
          : '当前主要基于简历与沟通证据评估',
      evidence: [...interviewEvidence.map((item) => item.evidence), ...base.evidence],
    });
  });

  return candidateDimensions;
}

function buildStrengths(dimensions: CandidateDecisionDimensionDto[]): string[] {
  return dimensions
    .filter((dimension) => dimension.key !== 'risk' && dimension.score >= 0.6)
    .map((dimension) => {
      const evidence = dimension.evidence.find(
        (item) => !/尚缺少|未发现|需用具体项目结果验证/.test(item),
      );
      return `${dimension.label}（${Math.round(dimension.score * 100)}%）：${evidence ?? dimension.summary}`;
    });
}

function buildWeaknesses(
  candidate: CandidateScreeningDetailDto,
  feedbacks: CandidateInterviewFeedbackDto[],
  dimensions: CandidateDecisionDimensionDto[],
  riskReasons: string[],
): string[] {
  const weaknesses = unique([
    ...dimensions
      .filter((dimension) => dimension.key !== 'risk' && dimension.status === 'concern')
      .map((dimension) => `${dimension.label}：${dimension.evidence[0] ?? dimension.summary}`),
    ...candidate.tags.risk,
    ...feedbacks.flatMap((feedback) => feedback.cons),
    ...riskReasons,
  ]);
  return weaknesses.length > 0
    ? weaknesses.slice(0, 8)
    : ['暂无明确短板，仍需持续验证未覆盖的胜任力维度'];
}

function buildSuggestions(params: {
  hireDecision: CandidateHireDecision;
  feedbacks: CandidateInterviewFeedbackDto[];
  riskReasons: string[];
  risks: DecisionRiskFlags;
  requiredStageNames: string[];
  completedStageCount: number;
}): CandidateDecisionResultDto['suggestions'] {
  const suggestions: CandidateDecisionResultDto['suggestions'] = [];

  if (params.hireDecision === 'no') {
    suggestions.push({
      type: 'action',
      content: '不要直接发 offer，先复盘面试证据并明确淘汰或补面原因。',
    });
  } else {
    suggestions.push({
      type: 'action',
      content:
        params.hireDecision === 'strong_yes'
          ? '可以准备 offer，并在 48 小时内确认薪资预期和到岗时间。'
          : '建议推进 offer 前确认关键疑虑，避免信息不足导致误判。',
    });
  }

  if (params.completedStageCount < params.requiredStageNames.length) {
    suggestions.push({
      type: 'action',
      content: `补齐${params.requiredStageNames.join('、')}的结构化反馈后再做最终决策。`,
    });
  }
  if (params.risks.salarySensitive) {
    suggestions.push({ type: 'action', content: '发 offer 前先沟通薪资范围和可谈空间。' });
  }
  if (params.risks.hasOtherOffers) {
    suggestions.push({
      type: 'action',
      content: '明确候选人其他 offer 时间线，缩短内部决策等待。',
    });
  }
  if (params.riskReasons.some((reason) => reason.endsWith('结论为 reject'))) {
    suggestions.push({
      type: 'action',
      content: '已有面试结论为 reject，不建议绕过；如需继续，应先复核并更新该轮结论。',
    });
  }

  return suggestions.slice(0, 5);
}

export function evaluateCandidateHiringDecision(params: {
  jobDescription: JobDescriptionDto;
  candidate: CandidateScreeningDetailDto;
  interviewFeedbacks: CandidateInterviewFeedbackDto[];
}): CandidateDecisionResultDto {
  const requiredInterviewStages = getRequiredInterviewStages(
    params.jobDescription.interviewProcess,
  );
  const skillMatchScore = calculateSkillMatch(params.jobDescription, params.candidate);
  const experienceMatch = calculateExperienceMatch(params.jobDescription, params.candidate);
  const interviewScore = calculateInterviewScore(params.interviewFeedbacks);
  const intentLevel = inferIntentLevel(params.candidate, params.interviewFeedbacks);
  const risks = detectRisks(params.candidate, params.interviewFeedbacks);
  const responsiveness = calculateResponsiveness(params.candidate, params.interviewFeedbacks);
  const completedFeedbackStages = new Set(
    params.interviewFeedbacks.map((feedback) => feedback.stage),
  );
  const missingFeedbackStages = requiredInterviewStages
    .filter((stage) => !completedFeedbackStages.has(stage.id))
    .map((stage) => stage.id);
  const completedRequiredStageCount = requiredInterviewStages.length - missingFeedbackStages.length;
  const candidateDimensions = buildDimensionAssessments({
    candidate: params.candidate,
    feedbacks: params.interviewFeedbacks,
    skillMatchScore,
    interviewProcess: params.jobDescription.interviewProcess,
  });
  const coreCompetencyScore =
    candidateDimensions.find((dimension) => dimension.key === 'core_competency')?.score ?? 0;
  const riskReasons = getRiskReasons({
    coreCompetencyScore,
    risks,
    feedbacks: params.interviewFeedbacks,
    interviewProcess: params.jobDescription.interviewProcess,
  });
  const hardRejected =
    coreCompetencyScore < 0.4 ||
    params.interviewFeedbacks.some((feedback) => feedback.decision === 'reject');
  const riskCount = Object.values(risks).filter(Boolean).length;
  const dimensionAssessments = [
    ...candidateDimensions,
    createDimension({
      key: 'risk',
      label: '风险健康度',
      score: hardRejected ? 0.2 : clamp(1 - riskCount * 0.2),
      weight: 0,
      confidence: params.interviewFeedbacks.length > 0 ? 0.8 : 0.5,
      summary:
        riskReasons.length > 0
          ? `发现 ${riskReasons.length} 项风险信号`
          : '未发现明确的硬性风险信号',
      evidence: riskReasons.length > 0 ? riskReasons : ['无明确风险信号'],
      status: hardRejected ? 'concern' : riskCount > 0 ? 'acceptable' : 'strong',
    }),
  ];
  const weightedScore = roundTwo(
    dimensionAssessments.reduce(
      (total, dimension) => total + dimension.score * dimension.weight,
      0,
    ),
  );
  const riskLevel = getRiskLevel(riskReasons, hardRejected);
  const hireDecision = chooseHireDecision({
    weightedScore,
    hardRejected,
    riskLevel,
    feedbacks: params.interviewFeedbacks,
    dimensions: dimensionAssessments,
    requiredStageIds: requiredInterviewStages.map((stage) => stage.id),
  });

  return {
    decisionScope: missingFeedbackStages.length === 0 ? 'final' : 'preliminary',
    missingFeedbackStages,
    hireDecision,
    confidence: calculateConfidence({
      dimensions: dimensionAssessments,
      completedStageCount: completedRequiredStageCount,
      requiredStageCount: requiredInterviewStages.length,
    }),
    offerAcceptProbability: calculateOfferAcceptProbability({
      weightedScore,
      intentLevel,
      responsiveness,
      risks,
    }),
    generatedAt: new Date().toISOString(),
    features: {
      skillMatchScore,
      experienceMatch,
      interviewScore,
      intentLevel,
      risks,
      responsiveness,
    },
    dimensionAssessments,
    decisionTrace: {
      weightedScore,
      hardRejected,
      formula: dimensionAssessments
        .filter((dimension) => dimension.weight > 0)
        .map(({ key, label, score, weight, contribution }) => ({
          key,
          label,
          score,
          weight,
          contribution,
        })),
      thresholds: {
        strongYes: 0.82,
        strongYesDimensionFloor: 0.6,
        yes: 0.65,
        preliminaryYes: 0.6,
        hardRejectCoreCompetency: 0.4,
      },
      feedbackCoverage: {
        completed: completedRequiredStageCount,
        total: requiredInterviewStages.length,
      },
    },
    riskAnalysis: {
      level: riskLevel,
      reasons: riskReasons,
    },
    strengths: buildStrengths(dimensionAssessments),
    weaknesses: buildWeaknesses(
      params.candidate,
      params.interviewFeedbacks,
      dimensionAssessments,
      riskReasons,
    ),
    suggestions: buildSuggestions({
      hireDecision,
      feedbacks: params.interviewFeedbacks,
      riskReasons,
      risks,
      requiredStageNames: requiredInterviewStages.map((stage) => stage.name),
      completedStageCount: completedRequiredStageCount,
    }),
  };
}
