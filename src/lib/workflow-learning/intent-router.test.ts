import { routeWorkflowIntent } from './intent-router';

describe('routeWorkflowIntent', () => {
  it('routes ordinary chat without browser work', () => {
    expect(routeWorkflowIntent('你好，介绍一下你自己')).toEqual({ type: 'chat' });
  });

  it('routes BOSS home opening', () => {
    expect(routeWorkflowIntent('打开 BOSS 首页')).toEqual({ type: 'boss_open_home' });
    expect(routeWorkflowIntent('打开boss')).toEqual({ type: 'boss_open_home' });
  });

  it('routes BOSS first message extraction', () => {
    expect(routeWorkflowIntent('打开 BOSS 消息页并返回第一条信息')).toEqual({
      type: 'boss_read_first_message',
    });
  });

  it('does not route ordinary return-format prompts as browser workflows', () => {
    expect(routeWorkflowIntent('请返回 JSON')).toEqual({ type: 'chat' });
    expect(routeWorkflowIntent('返回上面的总结')).toEqual({ type: 'chat' });
  });

  it('does not route ordinary navigation-word prompts as browser workflows', () => {
    expect(routeWorkflowIntent('浏览器是什么')).toEqual({ type: 'chat' });
    expect(routeWorkflowIntent('如何打开思路')).toEqual({ type: 'chat' });
    expect(routeWorkflowIntent('介绍一下访问控制')).toEqual({ type: 'chat' });
  });

  it('does not treat BOSS home prompts as message extraction without message words', () => {
    expect(routeWorkflowIntent('打开 BOSS 首页')).toEqual({ type: 'boss_open_home' });
  });

  it('routes login completion', () => {
    expect(routeWorkflowIntent('已登录')).toEqual({ type: 'login_completed' });
    expect(routeWorkflowIntent('我已经登录好了')).toEqual({ type: 'login_completed' });
  });

  it('routes DSL generation', () => {
    expect(routeWorkflowIntent('生成指令')).toEqual({ type: 'generate_dsl' });
    expect(routeWorkflowIntent('效果没问题，生成 DSL')).toEqual({ type: 'generate_dsl' });
  });

  it('routes unsupported browser workflow separately from chat', () => {
    expect(routeWorkflowIntent('打开淘宝首页')).toEqual({ type: 'unknown_workflow' });
  });

  it('routes unsupported navigation only for clear page-opening prompts', () => {
    expect(routeWorkflowIntent('打开淘宝首页')).toEqual({ type: 'unknown_workflow' });
    expect(routeWorkflowIntent('进入淘宝首页')).toEqual({ type: 'unknown_workflow' });
    expect(routeWorkflowIntent('访问 https://example.com')).toEqual({ type: 'unknown_workflow' });
  });
});
