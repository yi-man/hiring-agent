import {
  BOSS_FIRST_MESSAGE_OUTPUT_KEY,
  BOSS_HOME_URL,
  BOSS_LOGIN_SUCCESS,
  BOSS_LOGIN_URL,
  BOSS_MESSAGES_URL,
} from '@/lib/workflow-learning/boss-config';
import type { WorkflowDsl } from '@/lib/workflow-learning/dsl';
import { runWorkflowDsl } from '@/lib/workflow-learning/dsl-runner';
import type { WorkflowIntent } from '@/lib/workflow-learning/intent-router';
import type { BrowserSessionManager } from '@/lib/workflow-learning/tools/browser-session';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';
import type {
  BossWorkflowTask,
  WorkflowSessionStore,
  WorkflowTraceEntry,
} from '@/lib/workflow-learning/workflow-session-store';

type WorkflowEventWithoutMetadata<T> = T extends unknown ? Omit<T, 'runId' | 'timestamp'> : never;

export type BossWorkflowEvent = WorkflowEventWithoutMetadata<WorkflowSseEvent>;

type BossWorkflowIntent = Extract<
  WorkflowIntent,
  | { type: 'boss_open_home' }
  | { type: 'boss_read_first_message' }
  | { type: 'login_completed' }
  | { type: 'generate_dsl' }
>;

type BossWorkflowManager = Pick<
  BrowserSessionManager,
  'inspectLogin' | 'openLogin' | 'navigate' | 'extractText' | 'waitForText'
>;

type BossWorkflowInput = {
  intent: BossWorkflowIntent;
  runId: string;
  sessionId: string;
  manager: BossWorkflowManager;
  store: WorkflowSessionStore;
  emit: (event: BossWorkflowEvent) => void;
  generateDsl: (trace: readonly Readonly<WorkflowTraceEntry>[]) => Promise<WorkflowDsl | null>;
};

type BossTaskInput = Omit<BossWorkflowInput, 'intent' | 'runId' | 'generateDsl'> & {
  task: BossWorkflowTask;
};

export async function runBossWorkflowIntent(input: BossWorkflowInput): Promise<void> {
  try {
    if (input.intent.type === 'boss_open_home') {
      await runProtectedBossTask({ ...input, task: 'boss_open_home' });
      return;
    }

    if (input.intent.type === 'boss_read_first_message') {
      await runProtectedBossTask({ ...input, task: 'boss_read_first_message' });
      return;
    }

    if (input.intent.type === 'login_completed') {
      await resumeAfterLogin(input);
      return;
    }

    await generateAndReplayDsl(input);
  } catch (error) {
    emitUnexpectedFailure(input.emit, error);
  }
}

async function runProtectedBossTask(input: BossTaskInput): Promise<void> {
  input.emit({
    type: 'workflow_state_changed',
    state: 'check_login',
    message: 'Checking BOSS login',
  });
  const login = await input.manager.inspectLogin({
    sessionId: input.sessionId,
    success: BOSS_LOGIN_SUCCESS,
  });

  if (!login.loggedIn) {
    input.store.setPendingTask(input.sessionId, input.task);
    input.store.setLoginStatus(input.sessionId, 'logged_out');
    input.emit({
      type: 'workflow_state_changed',
      state: 'login_required',
      message: 'BOSS login required',
    });
    await input.manager.openLogin({ sessionId: input.sessionId, loginUrl: BOSS_LOGIN_URL });
    input.emit({
      type: 'awaiting_login',
      sessionId: input.sessionId,
      loginUrl: BOSS_LOGIN_URL,
      message: '请在已打开的浏览器窗口中扫码登录 BOSS 直聘，完成后回复“已登录”。',
    });
    input.emit({
      type: 'assistant_final',
      text: '需要先登录 BOSS 直聘。我已经打开登录页，请扫码登录，完成后回复“已登录”。',
    });
    return;
  }

  input.store.setLoginStatus(input.sessionId, 'logged_in');
  if (input.task === 'boss_open_home') {
    await openBossHome(input);
    return;
  }

  await readFirstBossMessage(input);
}

async function openBossHome(input: Omit<BossTaskInput, 'task'>): Promise<void> {
  input.emit({
    type: 'workflow_state_changed',
    state: 'explore_target_page',
    message: 'Opening BOSS home',
  });
  const navigation = await input.manager.navigate({
    sessionId: input.sessionId,
    url: BOSS_HOME_URL,
  });

  input.store.recordSuccess(input.sessionId, {
    task: 'boss_open_home',
    trace: [
      { step: 'check_login', result: 'logged_in' },
      {
        step: 'navigate',
        result: {
          requestedUrl: BOSS_HOME_URL,
          pageUrl: navigation.url,
          title: navigation.title,
        },
      },
    ],
    outputs: { pageUrl: navigation.url },
  });
  input.emit({
    type: 'workflow_state_changed',
    state: 'success',
    message: 'BOSS home opened',
  });
  input.emit({
    type: 'assistant_final',
    text: `已打开 BOSS 首页：${navigation.url}。页面会保持打开。`,
  });
}

async function readFirstBossMessage(input: Omit<BossTaskInput, 'task'>): Promise<void> {
  input.emit({
    type: 'workflow_state_changed',
    state: 'explore_target_page',
    message: 'Opening BOSS messages',
  });
  const navigation = await input.manager.navigate({
    sessionId: input.sessionId,
    url: BOSS_MESSAGES_URL,
  });

  input.emit({
    type: 'workflow_state_changed',
    state: 'extract_result',
    message: 'Extracting first BOSS message',
  });
  const extracted = await input.manager.extractText({
    sessionId: input.sessionId,
    selectorHint: 'first message item in BOSS message list',
  });
  const message = extracted.text.trim();

  if (!message) {
    input.emit({
      type: 'workflow_state_changed',
      state: 'failed',
      message: 'BOSS workflow failed',
    });
    input.emit({ type: 'error', message: 'No first BOSS message text extracted' });
    input.emit({
      type: 'assistant_final',
      text: '执行失败：未读取到第一条消息内容。',
    });
    return;
  }

  input.store.recordSuccess(input.sessionId, {
    task: 'boss_read_first_message',
    trace: [
      { step: 'check_login', result: 'logged_in' },
      {
        step: 'navigate',
        result: {
          requestedUrl: BOSS_MESSAGES_URL,
          pageUrl: navigation.url,
          title: navigation.title,
        },
      },
      {
        step: 'extract_text',
        result: {
          selectorHint: 'first message item in BOSS message list',
          text: message,
          pageUrl: extracted.url,
        },
      },
    ],
    outputs: { [BOSS_FIRST_MESSAGE_OUTPUT_KEY]: message },
  });
  input.emit({
    type: 'workflow_state_changed',
    state: 'success',
    message: 'First BOSS message extracted',
  });
  input.emit({
    type: 'assistant_final',
    text: message,
  });
}

async function resumeAfterLogin(input: BossWorkflowInput): Promise<void> {
  input.emit({
    type: 'workflow_state_changed',
    state: 'resume_after_login',
    message: 'Verifying BOSS login',
  });
  const login = await input.manager.inspectLogin({
    sessionId: input.sessionId,
    success: BOSS_LOGIN_SUCCESS,
  });

  if (!login.loggedIn) {
    input.store.setLoginStatus(input.sessionId, 'logged_out');
    input.emit({
      type: 'assistant_final',
      text: '还没有检测到 BOSS 登录成功，请继续完成扫码登录后再回复“已登录”。',
    });
    return;
  }

  input.store.setLoginStatus(input.sessionId, 'logged_in');
  input.emit({ type: 'login_verified', sessionId: input.sessionId });

  const pendingTask = input.store.get(input.sessionId).pendingTask;
  if (!pendingTask) {
    input.emit({ type: 'assistant_final', text: '已检测到 BOSS 登录成功。' });
    return;
  }

  await runProtectedBossTask({ ...input, task: pendingTask });
}

async function generateAndReplayDsl(input: BossWorkflowInput): Promise<void> {
  const session = input.store.get(input.sessionId);
  if (session.lastSuccessfulTrace.length === 0) {
    input.emit({
      type: 'assistant_final',
      text: '请先完成一次可执行的 workflow，再生成指令。',
    });
    return;
  }

  input.emit({
    type: 'workflow_state_changed',
    state: 'generate_dsl',
    message: 'Generating Workflow DSL',
  });
  const workflow = await input.generateDsl(session.lastSuccessfulTrace);

  if (!workflow) {
    input.emit({
      type: 'dsl_validation_result',
      ok: false,
      error: 'Unable to generate valid Workflow DSL',
    });
    input.emit({
      type: 'assistant_final',
      text: 'DSL 生成失败：没有得到符合 schema 的指令。',
    });
    return;
  }

  input.emit({
    type: 'workflow_state_changed',
    state: 'replay_dsl',
    message: 'Replaying Workflow DSL',
  });
  const replay = await runWorkflowDsl({
    workflow,
    sessionId: input.sessionId,
    manager: input.manager,
    emit: input.emit,
  });

  if (!replay.ok) {
    const error = replay.error ?? 'DSL replay did not complete';
    input.emit({ type: 'dsl_validation_result', ok: false, error });
    input.emit({
      type: 'assistant_final',
      text: `DSL 回放失败：${replay.awaitingLogin ? '需要登录或步骤未完成' : error}`,
    });
    return;
  }

  input.emit({ type: 'dsl_validation_result', ok: true });
  input.emit({ type: 'workflow_dsl', workflow });
  input.emit({ type: 'assistant_final', text: 'DSL 已生成并回放成功。' });
}

function emitUnexpectedFailure(emit: (event: BossWorkflowEvent) => void, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown BOSS workflow error';
  emit({
    type: 'workflow_state_changed',
    state: 'failed',
    message: 'BOSS workflow failed',
  });
  emit({ type: 'error', message });
  emit({
    type: 'assistant_final',
    text: `执行失败：${message}`,
  });
}
