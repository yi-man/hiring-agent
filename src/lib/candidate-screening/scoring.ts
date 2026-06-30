import type { CandidateActionPlan, ScoreDetail } from './types';

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreCandidate(input: Omit<ScoreDetail, 'total'>): ScoreDetail {
  const skill = clampScore(input.skill);
  const domain = clampScore(input.domain);
  const ability = clampScore(input.ability);
  const risk = clampScore(input.risk);
  const llmBonus = clampScore(input.llmBonus);
  const total = clampScore(skill * 0.4 + domain * 0.2 + ability * 0.3 - risk * 0.1 + llmBonus);

  return {
    skill,
    domain,
    ability,
    risk,
    llmBonus,
    total: roundTwo(total),
  };
}

export function decideCandidateAction(totalScore: number): CandidateActionPlan {
  const score = clampScore(totalScore);

  if (score >= 85) {
    return {
      action: 'chat',
      priority: 'high',
      message: null,
      reason: 'candidate score meets high-priority outreach threshold',
    };
  }

  if (score >= 70) {
    return {
      action: 'chat',
      priority: 'medium',
      message: null,
      reason: 'candidate score meets outreach threshold',
    };
  }

  if (score > 60) {
    return {
      action: 'collect',
      priority: 'low',
      message: null,
      reason: 'candidate score needs more information before outreach',
    };
  }

  return {
    action: 'skip',
    priority: 'low',
    message: null,
    reason: 'candidate score is below screening threshold',
  };
}
