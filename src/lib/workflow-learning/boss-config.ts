import type { LoginSuccessCriteria } from '@/lib/workflow-learning/tools/browser-session';

type LoginRequiredCriteria = {
  urlIncludes?: string[];
  textIncludes?: string[];
};

export const BOSS_HOME_URL = 'https://www.zhipin.com/';
export const BOSS_LOGIN_URL = 'https://www.zhipin.com/web/user/';
export const BOSS_MESSAGES_URL = 'https://www.zhipin.com/web/geek/chat';
export const BOSS_FIRST_MESSAGE_OUTPUT_KEY = 'firstMessage';

export const BOSS_LOGIN_SUCCESS: LoginSuccessCriteria = {
  urlNotIncludes: ['/web/user'],
  textIncludes: ['消息', '沟通', '职位'],
};

export const BOSS_LOGIN_REQUIRED = {
  urlIncludes: ['/web/user'],
  textIncludes: ['扫码', '登录', '微信'],
} satisfies LoginRequiredCriteria;
