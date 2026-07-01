import { CANDIDATE_COMMUNICATION_TERMINAL_STAGES } from './constants';
import type {
  CandidateCommunicationStage,
  CandidateIntentLevel,
  CandidateMessageIntent,
} from './types';

type IntentRule = {
  intent: CandidateMessageIntent;
  level: CandidateIntentLevel;
  pattern: RegExp;
};

export type CandidateMessageClassification = {
  intent: CandidateMessageIntent;
  intentLevel: CandidateIntentLevel;
  signals: string[];
};

const INTENT_RULES: IntentRule[] = [
  {
    intent: 'not_interested',
    level: 'low',
    pattern: /不考虑|暂不|没兴趣|不感兴趣|不用了|不合适|谢谢.*不/i,
  },
  {
    intent: 'contact_shared',
    level: 'high',
    pattern: /(微信|vx|wechat|加我|电话|手机号|手机|邮箱|email|@|1[3-9]\d{9}|wxid[_a-z0-9-]+)/i,
  },
  {
    intent: 'resume_shared',
    level: 'high',
    pattern: /(简历|resume|cv|附件|pdf|作品集|profile|履历)/i,
  },
  {
    intent: 'salary_question',
    level: 'medium',
    pattern: /(薪资|薪水|薪酬|工资|待遇|base|预算|年包|月薪|package)/i,
  },
  {
    intent: 'job_question',
    level: 'medium',
    pattern: /(岗位|职位|公司|团队|技术栈|地点|办公|远程|面试|职责|要求|jd)/i,
  },
  {
    intent: 'greeting',
    level: 'medium',
    pattern: /^(你好|您好|在吗|hi|hello|哈喽|还在招吗|方便聊聊)/i,
  },
];

export function classifyCandidateMessage(content: string): CandidateMessageClassification {
  const normalized = content.trim();
  if (!normalized) {
    return { intent: 'unknown', intentLevel: 'low', signals: [] };
  }

  const matched = INTENT_RULES.find((rule) => rule.pattern.test(normalized));
  if (!matched) {
    return { intent: 'unknown', intentLevel: 'low', signals: [] };
  }

  return {
    intent: matched.intent,
    intentLevel: matched.level,
    signals: [matched.intent],
  };
}

export function shouldSuppressAutomatedReply(stage: CandidateCommunicationStage): boolean {
  return (
    CANDIDATE_COMMUNICATION_TERMINAL_STAGES as readonly CandidateCommunicationStage[]
  ).includes(stage);
}
