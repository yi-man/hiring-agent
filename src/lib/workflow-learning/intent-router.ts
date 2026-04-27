export type WorkflowIntent =
  | { type: 'chat' }
  | { type: 'boss_open_home' }
  | { type: 'boss_read_first_message' }
  | { type: 'login_completed' }
  | { type: 'generate_dsl' }
  | { type: 'unknown_workflow' };

export function routeWorkflowIntent(input: string): WorkflowIntent {
  const text = input.trim();
  const lower = text.toLowerCase();

  if (/^(已登录|已经登录|我已登录|我已经登录|登录好了|已完成登录)/i.test(text)) {
    return { type: 'login_completed' };
  }

  if (/生成\s*(指令|dsl|工作流)|生成.*(指令|dsl|工作流)/i.test(text)) {
    return { type: 'generate_dsl' };
  }

  const mentionsBoss = /boss|zhipin|直聘/i.test(text);
  const mentionsMessage = /消息|沟通|聊天|第一条|首条/i.test(text);
  const taskIntent = /打开|open|进入|查看|读取|返回/i.test(text);
  const navigationIntent = /打开|open|进入|访问|浏览/i.test(text);
  const explicitUrl = /https?:\/\/\S+|www\.\S+/i.test(text);
  const likelyPageTarget =
    /首页|页面|网页|网站|淘宝|京东|百度|google|github|\.com|\.cn|\.net|\.org/i.test(text);
  const startsWithNavigation = /^(打开|open|进入|访问|浏览)/i.test(text);

  if (mentionsBoss && mentionsMessage && taskIntent) {
    return { type: 'boss_read_first_message' };
  }

  if (mentionsBoss && (navigationIntent || lower === 'boss')) {
    return { type: 'boss_open_home' };
  }

  if (explicitUrl || (startsWithNavigation && navigationIntent && likelyPageTarget)) {
    return { type: 'unknown_workflow' };
  }

  return { type: 'chat' };
}
