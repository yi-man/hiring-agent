import {
  parseCandidateEvaluationOutput,
  runCandidateEvaluationLLM,
  type CandidateEvaluationLlmOutput,
} from './llm';
import { decideCandidateAction, scoreCandidate } from './scoring';
import type { EvaluationSchema } from './types';

type RunCandidateLLM = typeof runCandidateEvaluationLLM;

function getRuleBasedSkillTags(evaluationSchema: EvaluationSchema, resumeText: string): string[] {
  const normalizedResume = resumeText.toLowerCase();
  return evaluationSchema.skills.filter((skill) => normalizedResume.includes(skill.toLowerCase()));
}

function buildRuleBasedFallback(params: {
  evaluationSchema: EvaluationSchema;
  resumeText: string;
  error: unknown;
}): CandidateEvaluationLlmOutput {
  const skillTags = getRuleBasedSkillTags(params.evaluationSchema, params.resumeText);
  const message =
    params.error instanceof Error
      ? `LLM 评估失败，已使用规则兜底：${params.error.message}`
      : 'LLM 评估失败，已使用规则兜底';

  return {
    tags: {
      skills: skillTags,
      domainKnowledge: [],
      generalAbility: [],
      risk: ['llm_evaluation_unavailable'],
      activity: [],
      custom: [],
    },
    score: {
      skill: skillTags.length > 0 ? 65 : 40,
      domain: 50,
      ability: 50,
      risk: 30,
      llmBonus: 0,
    },
    reason: message,
  };
}

export async function evaluateCandidateForJd(params: {
  jobTitle: string;
  evaluationSchema: EvaluationSchema;
  resumeText: string;
  candidateName: string;
  runLLM?: RunCandidateLLM;
}) {
  const runLLM = params.runLLM ?? runCandidateEvaluationLLM;
  let output: CandidateEvaluationLlmOutput;

  try {
    output = parseCandidateEvaluationOutput(await runLLM(params));
  } catch (error) {
    output = buildRuleBasedFallback({
      evaluationSchema: params.evaluationSchema,
      resumeText: params.resumeText,
      error,
    });
  }

  const score = scoreCandidate(output.score);
  const decision = decideCandidateAction(score.total);
  return { tags: output.tags, score, decision: { ...decision, reason: output.reason } };
}
