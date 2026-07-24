import type { InterviewProcess } from './types';

export const DEFAULT_INTERVIEW_PROCESSES: readonly InterviewProcess[] = [
  {
    id: 'default-technical',
    positionType: '技术研发类',
    autoMatch: {
      departments: ['技术部', '研发部', '数据部', '信息技术部'],
      positionKeywords: [
        '前端',
        '后端',
        '全栈',
        '客户端',
        '算法',
        'AI',
        '人工智能',
        '测试',
        'QA',
        '运维',
        'DevOps',
        '数据',
        '安全',
        '架构师',
        '研发',
        '工程师',
      ],
      isFallback: false,
    },
    stages: [
      {
        id: 'technical-foundation',
        name: '技术初面',
        purpose: '验证核心技术基础、项目真实性与岗位必备能力',
        sortOrder: 0,
      },
      {
        id: 'technical-depth',
        name: '技术复面',
        purpose: '深入考察系统设计、问题解决、质量意识与技术判断',
        sortOrder: 1,
      },
      {
        id: 'technical-manager',
        name: '技术主管面',
        purpose: '确认协作影响力、成长潜力、岗位动机与团队匹配',
        sortOrder: 2,
      },
    ],
  },
  {
    id: 'default-product-design',
    positionType: '产品设计类',
    autoMatch: {
      departments: ['产品部', '设计部', '用户体验部'],
      positionKeywords: ['产品', '交互', '视觉', 'UI', 'UX', '设计师', '用户研究'],
      isFallback: false,
    },
    stages: [
      {
        id: 'product-portfolio',
        name: '专业初面',
        purpose: '验证产品或设计基本功、代表项目与用户问题理解',
        sortOrder: 0,
      },
      {
        id: 'product-case',
        name: '案例复面',
        purpose: '通过案例、作品集或现场题考察分析、取舍与落地能力',
        sortOrder: 1,
      },
      {
        id: 'product-lead',
        name: '负责人面',
        purpose: '确认业务判断、跨团队协作、岗位动机与发展匹配',
        sortOrder: 2,
      },
    ],
  },
  {
    id: 'default-sales-marketing',
    positionType: '销售市场类',
    autoMatch: {
      departments: ['销售部', '市场部', '市场销售部', '商务部'],
      positionKeywords: ['销售', '商务', 'BD', '客户经理', '市场', '品牌', '增长', '渠道'],
      isFallback: false,
    },
    stages: [
      {
        id: 'sales-foundation',
        name: '业务初面',
        purpose: '验证行业认知、客户经验、目标意识与沟通基本功',
        sortOrder: 0,
      },
      {
        id: 'sales-simulation',
        name: '场景复面',
        purpose: '通过客户场景或方案演练考察策略、影响与成交能力',
        sortOrder: 1,
      },
      {
        id: 'sales-lead',
        name: '业务负责人面',
        purpose: '确认业绩真实性、资源方法、岗位动机与团队匹配',
        sortOrder: 2,
      },
    ],
  },
  {
    id: 'default-operations-service',
    positionType: '运营客服类',
    autoMatch: {
      departments: ['运营部', '客服部', '客户成功部', '内容部'],
      positionKeywords: ['运营', '客服', '客户成功', '社区', '内容', '审核', '服务'],
      isFallback: false,
    },
    stages: [
      {
        id: 'operations-foundation',
        name: '业务初面',
        purpose: '验证用户意识、数据敏感度、执行能力与相关业务经验',
        sortOrder: 0,
      },
      {
        id: 'operations-case',
        name: '场景复面',
        purpose: '通过运营或服务场景考察分析、应变、复盘与协同能力',
        sortOrder: 1,
      },
      {
        id: 'operations-manager',
        name: '主管面',
        purpose: '确认责任心、岗位动机、工作节奏与团队匹配',
        sortOrder: 2,
      },
    ],
  },
  {
    id: 'default-administration',
    positionType: '行政职能类',
    autoMatch: {
      departments: ['人力资源部', '人力行政部', '行政部', '财务部', '法务部', '采购部'],
      positionKeywords: [
        '行政',
        '人事',
        'HR',
        '招聘',
        '薪酬',
        '财务',
        '会计',
        '法务',
        '采购',
        '助理',
        '文员',
      ],
      isFallback: false,
    },
    stages: [
      {
        id: 'administration-hr',
        name: 'HR 初面',
        purpose: '确认基本经历、稳定性、职业动机与岗位前提',
        sortOrder: 0,
      },
      {
        id: 'administration-manager',
        name: '用人部门面',
        purpose: '验证专业实务、细节意识、服务意识与跨部门协同',
        sortOrder: 1,
      },
      {
        id: 'administration-lead',
        name: '负责人面',
        purpose: '确认职业操守、风险意识、岗位匹配与最终录用风险',
        sortOrder: 2,
      },
    ],
  },
  {
    id: 'default-management',
    positionType: '管理类',
    autoMatch: {
      departments: ['管理层', '总裁办'],
      positionKeywords: ['负责人', '主管', '总监', 'Head', 'VP', '合伙人', '总经理'],
      isFallback: false,
    },
    stages: [
      {
        id: 'management-hr',
        name: '人才沟通',
        purpose: '确认管理经历、职业动机、任职条件与关键风险',
        sortOrder: 0,
      },
      {
        id: 'management-business',
        name: '业务负责人面',
        purpose: '验证战略理解、经营结果、组织管理与关键决策能力',
        sortOrder: 1,
      },
      {
        id: 'management-executive',
        name: '高管面',
        purpose: '确认价值观、组织影响力、长期匹配与最终录用判断',
        sortOrder: 2,
      },
    ],
  },
  {
    id: 'default-general',
    positionType: '通用岗位类',
    autoMatch: {
      departments: [],
      positionKeywords: [],
      isFallback: true,
    },
    stages: [
      {
        id: 'general-foundation',
        name: '岗位初面',
        purpose: '验证核心经历、岗位基础能力与求职动机',
        sortOrder: 0,
      },
      {
        id: 'general-manager',
        name: '用人经理面',
        purpose: '深入验证问题解决、协作方式与岗位胜任力',
        sortOrder: 1,
      },
      {
        id: 'general-final',
        name: '综合终面',
        purpose: '确认团队匹配、发展预期与最终录用风险',
        sortOrder: 2,
      },
    ],
  },
];
