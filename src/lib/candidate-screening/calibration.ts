import {
  CANDIDATE_EVALUATION_PROMPT_VERSION,
  CANDIDATE_SCREENING_CALIBRATION_VERSION,
  CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
  CANDIDATE_SCREENING_SCORING_VERSION,
} from './constants';
import type {
  CandidateCalibrationAnchor,
  CandidateCalibrationCategory,
  CandidateCalibrationProfile,
  CandidateScoringQualityPolicy,
} from './types';
import type { JobDescriptionDto } from '@/types';

const CATEGORY_LABELS: Record<CandidateCalibrationCategory, string> = {
  technical: '技术研发',
  data_ai: '数据与 AI',
  product: '产品',
  sales: '销售商务',
  operations: '运营',
  design: '设计',
  management: '管理',
  general: '通用岗位',
};

export const CANDIDATE_CALIBRATION_CATEGORIES = Object.entries(CATEGORY_LABELS).map(
  ([category, label]) => ({
    category: category as CandidateCalibrationCategory,
    label,
  }),
);

const DEFAULT_REVIEW_SAMPLING = [
  '每次运行抽查最高分、60-75 边界分、低分但向量匹配高的候选人',
  '把用户改判、联系结果、面试反馈沉淀为校准样本候选',
  'prompt、rubric、校准集或模型版本变化时，只对每类岗位小样本真实回归',
];

const ANCHORS_BY_CATEGORY: Record<CandidateCalibrationCategory, CandidateCalibrationAnchor[]> = {
  technical: [
    {
      label: '强匹配',
      expectedAction: 'chat',
      scoreRange: [85, 100],
      positiveSignals: ['核心技术栈直接命中', '有相近系统规模或复杂度', '能体现稳定交付和问题定位'],
      riskSignals: ['关键技术只泛泛提到'],
      guidance: '核心技能、项目复杂度和交付证据都清晰时才给高分。',
    },
    {
      label: '合格匹配',
      expectedAction: 'chat',
      scoreRange: [70, 84],
      positiveSignals: ['多数核心技术匹配', '有相关项目经验', '缺口可通过面试确认'],
      riskSignals: ['少量关键要求缺证据'],
      guidance: '可进入沟通，但 reason 要写清楚待确认缺口。',
    },
    {
      label: '边界匹配',
      expectedAction: 'collect',
      scoreRange: [61, 69],
      positiveSignals: ['部分技能相关', '行业或通用能力有可迁移性'],
      riskSignals: ['核心技术、年限或项目深度不足'],
      guidance: '优先收集更多信息，不要因为单个关键词给过高分。',
    },
    {
      label: '弱匹配',
      expectedAction: 'skip',
      scoreRange: [0, 60],
      positiveSignals: ['只有外围技能或通用经历'],
      riskSignals: ['核心技能缺失', '简历信息过少', '岗位方向明显不一致'],
      guidance: '核心技能大多缺失时 skill 不得超过 60。',
    },
  ],
  data_ai: [
    {
      label: '强匹配',
      expectedAction: 'chat',
      scoreRange: [85, 100],
      positiveSignals: [
        '模型、数据或 LLM 应用经验直接命中',
        '有上线或评估闭环',
        '能说明数据质量和效果指标',
      ],
      riskSignals: ['只做过概念验证'],
      guidance: '同时看算法/工程落地和效果评估证据。',
    },
    {
      label: '合格匹配',
      expectedAction: 'chat',
      scoreRange: [70, 84],
      positiveSignals: ['有相关算法、RAG、数据工程或应用落地经验', '部分指标或项目结果明确'],
      riskSignals: ['业务场景或生产化深度不足'],
      guidance: '能落地但深度待确认时进入沟通。',
    },
    {
      label: '边界匹配',
      expectedAction: 'collect',
      scoreRange: [61, 69],
      positiveSignals: ['有 Python、数据分析或 AI 工具经验'],
      riskSignals: ['缺少模型评估、上线、数据治理证据'],
      guidance: '区分使用 AI 工具和建设 AI 系统。',
    },
    {
      label: '弱匹配',
      expectedAction: 'skip',
      scoreRange: [0, 60],
      positiveSignals: ['只有泛数据或泛开发经验'],
      riskSignals: ['无 AI/数据相关事实', '关键能力空白'],
      guidance: '不要把普通开发经验等同 AI 岗匹配。',
    },
  ],
  product: [
    {
      label: '强匹配',
      expectedAction: 'chat',
      scoreRange: [85, 100],
      positiveSignals: ['目标用户和业务场景匹配', '有完整产品闭环', '能体现数据、需求和跨团队推进'],
      riskSignals: ['只描述职责不描述结果'],
      guidance: '高分需要有从问题到上线再到指标的证据。',
    },
    {
      label: '合格匹配',
      expectedAction: 'chat',
      scoreRange: [70, 84],
      positiveSignals: ['有相近产品方向', '能独立负责模块', '有需求分析和协作证据'],
      riskSignals: ['商业结果或数据意识不充分'],
      guidance: '多数能力匹配但业务深度待确认时进入沟通。',
    },
    {
      label: '边界匹配',
      expectedAction: 'collect',
      scoreRange: [61, 69],
      positiveSignals: ['有项目或需求经验', '具备可迁移行业理解'],
      riskSignals: ['缺少独立 owner 证据', '岗位类型差异较大'],
      guidance: '需要补充作品、项目范围或指标。',
    },
    {
      label: '弱匹配',
      expectedAction: 'skip',
      scoreRange: [0, 60],
      positiveSignals: ['只有协助性工作'],
      riskSignals: ['无产品闭环', '与目标业务场景差距大'],
      guidance: '不要把项目参与等同产品 owner 能力。',
    },
  ],
  sales: [
    {
      label: '强匹配',
      expectedAction: 'chat',
      scoreRange: [85, 100],
      positiveSignals: ['客户类型匹配', '有明确业绩或转化结果', '销售流程和客情维护证据充分'],
      riskSignals: ['业绩口径含糊'],
      guidance: '高分需要客户、金额、周期或转化结果等可验证事实。',
    },
    {
      label: '合格匹配',
      expectedAction: 'chat',
      scoreRange: [70, 84],
      positiveSignals: ['有相近行业或客户资源', '能独立推进商机'],
      riskSignals: ['销售规模或客群层级待确认'],
      guidance: '客群或产品相近即可沟通确认。',
    },
    {
      label: '边界匹配',
      expectedAction: 'collect',
      scoreRange: [61, 69],
      positiveSignals: ['有销售、BD 或客户成功经验'],
      riskSignals: ['缺少成交闭环或目标客群不匹配'],
      guidance: '先补业绩、客群、销售周期信息。',
    },
    {
      label: '弱匹配',
      expectedAction: 'skip',
      scoreRange: [0, 60],
      positiveSignals: ['只有服务或支持经历'],
      riskSignals: ['无主动销售证据', '目标客户不匹配'],
      guidance: '不要把客户沟通经历直接等同销售能力。',
    },
  ],
  operations: [
    {
      label: '强匹配',
      expectedAction: 'chat',
      scoreRange: [85, 100],
      positiveSignals: ['运营类型匹配', '有指标增长或转化结果', '能体现策略、执行和复盘'],
      riskSignals: ['只列活动不列效果'],
      guidance: '高分需要运营动作和指标结果同时存在。',
    },
    {
      label: '合格匹配',
      expectedAction: 'chat',
      scoreRange: [70, 84],
      positiveSignals: ['有相近用户、内容、活动或增长运营经验', '能独立推进项目'],
      riskSignals: ['方法论或数据复盘不足'],
      guidance: '方向匹配且有执行结果时可沟通。',
    },
    {
      label: '边界匹配',
      expectedAction: 'collect',
      scoreRange: [61, 69],
      positiveSignals: ['有运营执行经验', '行业可迁移'],
      riskSignals: ['缺少指标、策略或 owner 证据'],
      guidance: '需要补充数据和项目职责边界。',
    },
    {
      label: '弱匹配',
      expectedAction: 'skip',
      scoreRange: [0, 60],
      positiveSignals: ['只有泛执行或行政支持'],
      riskSignals: ['无目标运营类型经验', '无指标结果'],
      guidance: '不能仅凭“运营”关键词高分。',
    },
  ],
  design: [
    {
      label: '强匹配',
      expectedAction: 'chat',
      scoreRange: [85, 100],
      positiveSignals: ['设计方向匹配', '有作品或设计系统证据', '能体现用户问题、方案和效果'],
      riskSignals: ['无作品或效果说明'],
      guidance: '高分需要作品质量、问题理解和落地结果。',
    },
    {
      label: '合格匹配',
      expectedAction: 'chat',
      scoreRange: [70, 84],
      positiveSignals: ['有相近产品或视觉/交互经验', '协作和交付证据明确'],
      riskSignals: ['业务复杂度或主导程度待确认'],
      guidance: '作品方向相近时可沟通确认深度。',
    },
    {
      label: '边界匹配',
      expectedAction: 'collect',
      scoreRange: [61, 69],
      positiveSignals: ['有设计执行经验', '部分工具或行业匹配'],
      riskSignals: ['缺少作品、方法或 owner 证据'],
      guidance: '先收集作品集和项目角色。',
    },
    {
      label: '弱匹配',
      expectedAction: 'skip',
      scoreRange: [0, 60],
      positiveSignals: ['只有工具使用或泛创意经历'],
      riskSignals: ['目标设计方向不匹配', '缺少作品证据'],
      guidance: '没有作品或目标方向证据时保持低分。',
    },
  ],
  management: [
    {
      label: '强匹配',
      expectedAction: 'chat',
      scoreRange: [85, 100],
      positiveSignals: ['管理范围匹配', '团队规模和业务结果明确', '能体现组织、目标和人才培养'],
      riskSignals: ['只有 title 没有管理事实'],
      guidance: '管理岗高分要看范围、结果和组织能力。',
    },
    {
      label: '合格匹配',
      expectedAction: 'chat',
      scoreRange: [70, 84],
      positiveSignals: ['有带团队或项目 owner 经验', '业务场景相近'],
      riskSignals: ['团队规模、预算或结果待确认'],
      guidance: '管理半径相近即可沟通。',
    },
    {
      label: '边界匹配',
      expectedAction: 'collect',
      scoreRange: [61, 69],
      positiveSignals: ['有项目管理或小团队协作经验'],
      riskSignals: ['缺少正式管理和结果证据'],
      guidance: '需要补充团队规模、职责边界和结果。',
    },
    {
      label: '弱匹配',
      expectedAction: 'skip',
      scoreRange: [0, 60],
      positiveSignals: ['只有个人贡献者经历'],
      riskSignals: ['无管理事实', '目标层级差距大'],
      guidance: '不能把高级个人贡献者直接当管理岗强匹配。',
    },
  ],
  general: [
    {
      label: '强匹配',
      expectedAction: 'chat',
      scoreRange: [85, 100],
      positiveSignals: ['核心职责和行业场景直接匹配', '有明确结果和稳定交付'],
      riskSignals: ['关键要求证据不足'],
      guidance: '高分需要职责、场景和结果都匹配。',
    },
    {
      label: '合格匹配',
      expectedAction: 'chat',
      scoreRange: [70, 84],
      positiveSignals: ['多数职责匹配', '缺口可面试确认'],
      riskSignals: ['部分要求缺少事实'],
      guidance: '可以沟通，但要记录缺口。',
    },
    {
      label: '边界匹配',
      expectedAction: 'collect',
      scoreRange: [61, 69],
      positiveSignals: ['部分经历可迁移'],
      riskSignals: ['职责或行业差距明显'],
      guidance: '先补充关键信息再决定是否联系。',
    },
    {
      label: '弱匹配',
      expectedAction: 'skip',
      scoreRange: [0, 60],
      positiveSignals: ['只有泛相关经历'],
      riskSignals: ['核心职责缺失', '简历信息过少'],
      guidance: '缺少核心证据时保持低分。',
    },
  ],
};

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function buildJdText(jobDescription: JobDescriptionDto): string {
  return normalizeText(
    [
      jobDescription.department,
      jobDescription.position,
      jobDescription.positionDescription,
      jobDescription.content.title,
      jobDescription.content.summary,
      ...jobDescription.content.responsibilities,
      ...jobDescription.content.requirements,
      ...jobDescription.content.highlights,
      ...jobDescription.content.bonus,
    ].join(' '),
  );
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

export function inferCalibrationCategoryFromJd(
  jobDescription: JobDescriptionDto,
): CandidateCalibrationCategory {
  return inferCalibrationCategoryFromText(buildJdText(jobDescription));
}

export function inferCalibrationCategoryFromText(input: string): CandidateCalibrationCategory {
  const text = normalizeText(input);

  if (includesAny(text, ['算法', '机器学习', '深度学习', 'llm', 'rag', 'ai agent', '数据科学'])) {
    return 'data_ai';
  }
  if (/\b(ux|ui)\b/.test(text) || includesAny(text, ['设计师', '视觉', '交互设计', '设计系统'])) {
    return 'design';
  }
  if (includesAny(text, ['销售', '商务', 'bd', '大客户', '客户开发', '商机', '签约'])) {
    return 'sales';
  }
  if (includesAny(text, ['产品经理', '产品规划', '需求分析', '产品路线图', 'prd'])) {
    return 'product';
  }
  if (includesAny(text, ['运营', '增长', '社群', '活动运营', '内容运营', '用户运营'])) {
    return 'operations';
  }
  if (includesAny(text, ['负责人', '经理', '总监', '主管', 'leader', '管理岗', '团队管理'])) {
    return 'management';
  }
  if (
    includesAny(text, [
      '工程师',
      '研发',
      '后端',
      '前端',
      '全栈',
      'java',
      'react',
      'node.js',
      'python',
      '架构',
      'devops',
    ])
  ) {
    return 'technical';
  }

  return 'general';
}

export function buildCalibrationProfileForCategory(
  category: CandidateCalibrationCategory,
): CandidateCalibrationProfile {
  return {
    version: CANDIDATE_SCREENING_CALIBRATION_VERSION,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    anchors: ANCHORS_BY_CATEGORY[category],
    reviewSampling: DEFAULT_REVIEW_SAMPLING,
  };
}

export function buildCalibrationProfileFromJd(
  jobDescription: JobDescriptionDto,
): CandidateCalibrationProfile {
  const category = inferCalibrationCategoryFromJd(jobDescription);
  return buildCalibrationProfileForCategory(category);
}

export function buildScoringQualityPolicy(): CandidateScoringQualityPolicy {
  return {
    version: CANDIDATE_SCREENING_QUALITY_POLICY_VERSION,
    promptVersion: CANDIDATE_EVALUATION_PROMPT_VERSION,
    scoringVersion: CANDIDATE_SCREENING_SCORING_VERSION,
    calibrationVersion: CANDIDATE_SCREENING_CALIBRATION_VERSION,
    regressionTiers: [
      {
        name: 'replay',
        trigger: '每次修改评分公式、解析、复用、排序或日志展示',
        llmCalls: 'none',
        description: '使用已保存的 LLM 输出和单测回放，不产生真实 LLM 成本。',
      },
      {
        name: 'golden-sample',
        trigger: 'prompt、rubric、校准集或模型版本变化',
        llmCalls: 'small-sample',
        description: '每类岗位抽 5-10 条强匹配、边界、弱匹配样本真实调用，检查排序和动作是否漂移。',
      },
      {
        name: 'production-monitor',
        trigger: '每次真实筛选运行',
        llmCalls: 'none',
        description: '记录版本、分数分布、用户改判和后续面试结果，用于积累下一轮校准样本。',
      },
    ],
    iterationSteps: [
      '收集用户改判、联系结果、面试反馈和最终录用结果',
      '每周按岗位类型复盘误报、漏报和边界样本',
      '把高频判断差异沉淀为校准锚点或硬规则',
      '升级 promptVersion、scoringVersion 或 calibrationVersion 后跑小样本真实回归',
    ],
  };
}
