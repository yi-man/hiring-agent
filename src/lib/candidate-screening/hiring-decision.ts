import type { JobDescriptionDto, JD } from '@/types';
import type { CandidateInterviewFeedbackDto, CandidateScreeningDetailDto } from './repo';
import type {
  CandidateDecisionIntentLevel,
  CandidateDecisionRiskLevel,
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

export type CandidateDecisionResultDto = {
  hireDecision: CandidateHireDecision;
  confidence: number;
  offerAcceptProbability: number;
  generatedAt: string;
  features: CandidateDecisionFeaturesDto;
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

function inferIntentLevel(candidate: CandidateScreeningDetailDto): CandidateDecisionIntentLevel {
  if (candidate.candidate.replied || /积极|主动|尽快|感兴趣/.test(candidate.notes ?? '')) {
    return 'high';
  }
  if (candidate.candidate.contacted || candidate.actionStatus === 'success') {
    return 'medium';
  }
  return 'low';
}

function intentWeight(intent: CandidateDecisionIntentLevel): number {
  if (intent === 'high') return 0.9;
  if (intent === 'medium') return 0.6;
  return 0.35;
}

function calculateResponsiveness(candidate: CandidateScreeningDetailDto): number {
  if (candidate.candidate.replied) return 0.85;
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
  skillMatchScore: number;
  interviewScore: number;
  risks: DecisionRiskFlags;
  feedbacks: CandidateInterviewFeedbackDto[];
}): string[] {
  const reasons: string[] = [];
  if (params.skillMatchScore < 0.4) reasons.push('JD 技能匹配低于录用线');
  if (params.feedbacks.length > 0 && params.interviewScore < 0.5) {
    reasons.push('面试综合评分低于录用线');
  }
  if (
    params.feedbacks.some(
      (feedback) => feedback.stage === 'final_interview' && feedback.decision === 'reject',
    )
  ) {
    reasons.push('终面结论为 reject');
  }
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
}): CandidateHireDecision {
  if (params.hardRejected) return 'no';
  if (params.weightedScore >= 0.82 && params.riskLevel === 'low') return 'strong_yes';
  if (params.weightedScore >= 0.65) return 'yes';
  return 'no';
}

function calculateConfidence(params: {
  candidate: CandidateScreeningDetailDto;
  feedbacks: CandidateInterviewFeedbackDto[];
  hardRejected: boolean;
}): number {
  const feedbackCoverage = clamp(params.feedbacks.length / 3);
  const value =
    0.35 +
    0.15 +
    (params.candidate.resume ? 0.1 : 0) +
    feedbackCoverage * 0.3 +
    (params.candidate.candidate.contacted || params.candidate.candidate.replied ? 0.1 : 0) +
    (params.hardRejected ? 0.1 : 0);
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

function buildStrengths(
  candidate: CandidateScreeningDetailDto,
  feedbacks: CandidateInterviewFeedbackDto[],
): string[] {
  return unique([
    ...candidate.tags.skills,
    ...candidate.tags.domainKnowledge,
    ...candidate.tags.generalAbility,
    ...feedbacks.flatMap((feedback) => feedback.pros),
  ]).slice(0, 8);
}

function buildWeaknesses(
  candidate: CandidateScreeningDetailDto,
  feedbacks: CandidateInterviewFeedbackDto[],
  riskReasons: string[],
): string[] {
  const weaknesses = unique([
    ...candidate.tags.risk,
    ...feedbacks.flatMap((feedback) => feedback.cons),
    ...riskReasons,
  ]);
  return weaknesses.length > 0 ? weaknesses.slice(0, 8) : ['暂无明显短板，建议继续补齐终面证据'];
}

function buildSuggestions(params: {
  hireDecision: CandidateHireDecision;
  feedbacks: CandidateInterviewFeedbackDto[];
  riskReasons: string[];
  risks: DecisionRiskFlags;
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

  if (params.feedbacks.length < 3) {
    suggestions.push({
      type: 'action',
      content: '补齐一面、二面、终面的结构化反馈后再做最终决策。',
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
  if (params.riskReasons.includes('终面结论为 reject')) {
    suggestions.push({
      type: 'action',
      content: '终面 reject 不建议绕过，除非补面后结论发生变化。',
    });
  }

  return suggestions.slice(0, 5);
}

export function evaluateCandidateHiringDecision(params: {
  jobDescription: JobDescriptionDto;
  candidate: CandidateScreeningDetailDto;
  interviewFeedbacks: CandidateInterviewFeedbackDto[];
}): CandidateDecisionResultDto {
  const skillMatchScore = calculateSkillMatch(params.jobDescription, params.candidate);
  const experienceMatch = calculateExperienceMatch(params.jobDescription, params.candidate);
  const interviewScore = calculateInterviewScore(params.interviewFeedbacks);
  const intentLevel = inferIntentLevel(params.candidate);
  const risks = detectRisks(params.candidate, params.interviewFeedbacks);
  const responsiveness = calculateResponsiveness(params.candidate);
  const riskReasons = getRiskReasons({
    skillMatchScore,
    interviewScore,
    risks,
    feedbacks: params.interviewFeedbacks,
  });
  const hardRejected =
    skillMatchScore < 0.4 ||
    (params.interviewFeedbacks.length > 0 && interviewScore < 0.5) ||
    riskReasons.includes('终面结论为 reject');
  const riskLevel = getRiskLevel(riskReasons, hardRejected);
  const weightedScore =
    skillMatchScore * 0.4 +
    interviewScore * 0.3 +
    intentWeight(intentLevel) * 0.2 +
    responsiveness * 0.1;
  const hireDecision = chooseHireDecision({
    weightedScore,
    hardRejected,
    riskLevel,
    feedbacks: params.interviewFeedbacks,
  });

  return {
    hireDecision,
    confidence: calculateConfidence({
      candidate: params.candidate,
      feedbacks: params.interviewFeedbacks,
      hardRejected,
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
    riskAnalysis: {
      level: riskLevel,
      reasons: riskReasons,
    },
    strengths: buildStrengths(params.candidate, params.interviewFeedbacks),
    weaknesses: buildWeaknesses(params.candidate, params.interviewFeedbacks, riskReasons),
    suggestions: buildSuggestions({
      hireDecision,
      feedbacks: params.interviewFeedbacks,
      riskReasons,
      risks,
    }),
  };
}
