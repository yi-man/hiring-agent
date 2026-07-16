import type { CandidateEvaluationDimensionKey } from './types';

export type CandidateEvaluationDimensionDefinition = {
  key: CandidateEvaluationDimensionKey;
  label: string;
  weight: number;
  description: string;
  interviewPrompt: string;
};

export const CANDIDATE_EVALUATION_DIMENSIONS = [
  {
    key: 'core_competency',
    label: '核心任务胜任力',
    weight: 0.35,
    description: '候选人能否完成 JD 中最关键、最常发生的工作任务。',
    interviewPrompt: '记录候选人实际完成类似任务的方法、深度和可验证结果。',
  },
  {
    key: 'problem_solving',
    label: '复杂问题解决与专业判断',
    weight: 0.2,
    description: '面对复杂问题时的分析、设计、取舍和复盘能力。',
    interviewPrompt: '记录问题背景、候选人的判断依据、关键取舍及最终效果。',
  },
  {
    key: 'impact',
    label: '成果与业务影响力',
    weight: 0.2,
    description: '候选人在相关项目中的实际贡献、规模、结果和影响范围。',
    interviewPrompt: '区分团队成果与个人贡献，记录规模、指标和可验证影响。',
  },
  {
    key: 'collaboration',
    label: '协作、推动与责任感',
    weight: 0.15,
    description: '跨角色协作、主动推进、承担责任和处理分歧的能力。',
    interviewPrompt: '记录候选人如何协调他人、解决阻塞并对结果负责。',
  },
  {
    key: 'motivation',
    label: '动机与角色契合',
    weight: 0.1,
    description: '求职动机、岗位理解和发展方向与当前机会的契合程度。',
    interviewPrompt: '记录候选人选择岗位的原因、关注点和明确的约束条件。',
  },
] as const satisfies readonly CandidateEvaluationDimensionDefinition[];

const dimensionByKey = new Map(
  CANDIDATE_EVALUATION_DIMENSIONS.map((dimension) => [dimension.key, dimension]),
);

export function getCandidateEvaluationDimension(key: CandidateEvaluationDimensionKey) {
  const dimension = dimensionByKey.get(key);
  if (!dimension) throw new Error(`unknown candidate evaluation dimension: ${key}`);
  return dimension;
}
