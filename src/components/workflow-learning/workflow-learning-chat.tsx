'use client';

import { useCallback, useRef, useState } from 'react';
import { CheckCircle2, Copy, Loader2, Send } from 'lucide-react';
import { Button, Card, CardBody, Input } from '@/components/ui';
import { streamWorkflowLearningMessage } from '@/lib/workflow-learning/client';
import { WorkflowSseBuffer } from '@/lib/workflow-learning/parse-sse';
import type { WorkflowDsl } from '@/lib/workflow-learning/dsl';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';

type UserRow = { id: string; role: 'user'; content: string };
type AssistantRow = {
  id: string;
  role: 'assistant';
  trace: WorkflowSseEvent[];
  finalText?: string;
  error?: string;
  workflow?: WorkflowDsl;
  validation?: { ok: boolean; error?: string };
  login?: { status: 'waiting' | 'verified'; message: string; loginUrl?: string };
};

type Row = UserRow | AssistantRow;

export function WorkflowLearningChat() {
  const [rows, setRows] = useState<Row[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isRunning) return;
    setInput('');
    setClientError(null);
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    setRows((r) => [...r, { id: userId, role: 'user', content: text }]);
    setRows((r) => [...r, { id: assistantId, role: 'assistant', trace: [] }]);
    setIsRunning(true);

    try {
      const stream = await streamWorkflowLearningMessage(text, {
        sessionId: sessionIdRef.current,
      });
      const reader = stream.getReader();
      const buf = new WorkflowSseBuffer();

      const applyEvents = (events: WorkflowSseEvent[]) => {
        setRows((prev) => {
          const next = [...prev];
          const idx = next.findIndex((x) => x.id === assistantId);
          if (idx < 0) return prev;
          const a = next[idx] as AssistantRow;
          if (a.role !== 'assistant') return prev;
          let finalText = a.finalText;
          let error = a.error;
          let workflow = a.workflow;
          let validation = a.validation;
          let login = a.login;
          const trace = [...a.trace];
          for (const ev of events) {
            trace.push(ev);
            if (ev.type === 'assistant_final') {
              finalText = ev.text;
            }
            if (ev.type === 'error') {
              error = ev.message;
            }
            if (ev.type === 'workflow_dsl') {
              workflow = ev.workflow;
            }
            if (ev.type === 'dsl_validation_result') {
              validation = { ok: ev.ok, error: ev.error };
            }
            if (ev.type === 'awaiting_login') {
              login = {
                status: 'waiting',
                message: ev.message,
                loginUrl: ev.loginUrl,
              };
            }
            if (ev.type === 'login_verified') {
              login = {
                status: 'verified',
                message: '登录已验证，正在继续执行工作流。',
              };
            }
          }
          next[idx] = { ...a, trace, finalText, error, workflow, validation, login };
          return next;
        });
        queueMicrotask(scrollToBottom);
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const events = buf.push(value);
          if (events.length) applyEvents(events);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '请求失败';
      setClientError(msg);
      setRows((prev) => {
        const next = [...prev];
        const idx = next.findIndex((x) => x.id === assistantId);
        if (idx >= 0) {
          const a = next[idx] as AssistantRow;
          next[idx] = { ...a, error: msg };
        }
        return next;
      });
    } finally {
      setIsRunning(false);
    }
  }, [input, isRunning, scrollToBottom]);

  return (
    <div className="space-y-4">
      {clientError ? (
        <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border px-4 py-2 text-sm">
          {clientError}
        </div>
      ) : null}

      <div className="max-h-[min(70vh,720px)] space-y-4 overflow-y-auto pr-1">
        {rows.map((row) =>
          row.role === 'user' ? (
            <div key={row.id} className="flex justify-end">
              <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap">
                {row.content}
              </div>
            </div>
          ) : (
            <div key={row.id} className="flex justify-start">
              <Card className="border-border bg-card/80 max-w-[95%] border">
                <CardBody className="gap-3 text-sm">
                  <ExecutionTrace events={row.trace} />
                  {row.login ? <LoginStatus login={row.login} /> : null}
                  {row.validation ? <ValidationStatus validation={row.validation} /> : null}
                  {row.workflow ? <WorkflowDslArtifact workflow={row.workflow} /> : null}
                  {row.error ? <div className="text-destructive text-sm">{row.error}</div> : null}
                  {row.finalText ? (
                    <div className="border-border mt-1 border-t pt-2">
                      <div className="text-muted-foreground mb-1 text-xs">回答</div>
                      <div className="text-foreground whitespace-pre-wrap">{row.finalText}</div>
                    </div>
                  ) : null}
                  {isRunning && row.id === rows[rows.length - 1]?.id ? (
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      执行中…
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            </div>
          ),
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onValueChange={setInput}
          aria-label="Workflow Learning 任务输入"
          placeholder="描述任务，例如：打开 http://127.0.0.1:3100/api/health 并总结可见内容"
          isDisabled={isRunning}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          className="flex-1"
        />
        <Button
          color="primary"
          aria-label="发送"
          isDisabled={isRunning || !input.trim()}
          onPress={() => void send()}
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function ExecutionTrace({ events }: { events: WorkflowSseEvent[] }) {
  const tools = events.filter((e) => e.type === 'tool_call_start' || e.type === 'tool_call_result');
  const hasTraceEvents = events.some(
    (e) =>
      e.type === 'run_start' || e.type === 'workflow_state_changed' || e.type === 'dsl_replay_step',
  );
  if (tools.length === 0 && !hasTraceEvents) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs font-medium">执行轨迹</div>
      <ul className="space-y-2">
        {events.map((ev, i) => {
          if (ev.type === 'tool_call_start') {
            return (
              <li
                key={`${ev.toolCallId}-start-${i}`}
                className="bg-muted/40 rounded-md px-3 py-2 text-xs"
              >
                <div className="font-medium">工具 · {ev.toolName}</div>
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap opacity-90">
                  {ev.argsPreview}
                </pre>
              </li>
            );
          }
          if (ev.type === 'tool_call_result') {
            return (
              <li
                key={`${ev.toolCallId}-res-${i}`}
                className={`rounded-md px-3 py-2 text-xs ${ev.ok ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{ev.ok ? '结果' : '失败'}</span>
                  {ev.durationMs != null ? (
                    <span className="text-muted-foreground">{ev.durationMs} ms</span>
                  ) : null}
                </div>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap">
                  {ev.resultPreview}
                </pre>
              </li>
            );
          }
          if (ev.type === 'awaiting_login') {
            return (
              <li
                key={`${ev.runId}-login-${i}`}
                className="rounded-md bg-amber-500/10 px-3 py-2 text-xs"
              >
                <div className="font-medium">等待登录</div>
                <div className="mt-1 break-all opacity-90">{ev.loginUrl}</div>
              </li>
            );
          }
          if (ev.type === 'login_verified') {
            return (
              <li
                key={`${ev.runId}-login-ok-${i}`}
                className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs"
              >
                <div className="font-medium">登录已验证</div>
              </li>
            );
          }
          if (ev.type === 'workflow_state_changed') {
            return (
              <li
                key={`${ev.runId}-state-${ev.state}-${i}`}
                className="bg-muted/40 rounded-md px-3 py-2 text-xs"
              >
                <div className="font-medium">状态 · {ev.state}</div>
                {ev.message ? <div className="mt-1 opacity-90">{ev.message}</div> : null}
              </li>
            );
          }
          if (ev.type === 'dsl_replay_step') {
            return (
              <li
                key={`${ev.runId}-replay-${ev.stepId}-${i}`}
                className={`rounded-md px-3 py-2 text-xs ${
                  ev.status === 'failed'
                    ? 'bg-destructive/10 text-destructive'
                    : ev.status === 'success'
                      ? 'bg-emerald-500/10'
                      : ev.status === 'skipped'
                        ? 'bg-sky-500/10'
                        : 'bg-muted/40'
                }`}
              >
                <div className="font-medium">
                  DSL 回放 · {ev.stepId} · {ev.status}
                </div>
                {ev.message ? <div className="mt-1 opacity-90">{ev.message}</div> : null}
                {ev.outputPreview ? (
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap">
                    {ev.outputPreview}
                  </pre>
                ) : null}
                {ev.error ? <div className="mt-1">{ev.error}</div> : null}
              </li>
            );
          }
          return null;
        })}
      </ul>
    </div>
  );
}

function LoginStatus({
  login,
}: {
  login: { status: 'waiting' | 'verified'; message: string; loginUrl?: string };
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        login.status === 'verified'
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-amber-500/30 bg-amber-500/10'
      }`}
    >
      <div className="flex items-center gap-2 font-medium">
        {login.status === 'verified' ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        {login.status === 'verified' ? '登录完成' : '等待你完成登录'}
      </div>
      <div className="mt-1 text-xs opacity-90">{login.message}</div>
      {login.loginUrl ? (
        <div className="mt-1 text-xs break-all opacity-80">{login.loginUrl}</div>
      ) : null}
    </div>
  );
}

function ValidationStatus({ validation }: { validation: { ok: boolean; error?: string } }) {
  return (
    <div
      className={`rounded-md px-3 py-2 text-xs ${
        validation.ok ? 'bg-emerald-500/10' : 'bg-destructive/10 text-destructive'
      }`}
    >
      {validation.ok ? 'DSL 校验通过' : `DSL 校验失败：${validation.error ?? '未知错误'}`}
    </div>
  );
}

function WorkflowDslArtifact({ workflow }: { workflow: WorkflowDsl }) {
  const json = JSON.stringify(workflow, null, 2);
  return (
    <div className="border-border mt-1 rounded-lg border">
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <div>
          <div className="text-xs font-medium">Workflow DSL</div>
          <div className="text-muted-foreground text-xs">{workflow.metadata.name}</div>
        </div>
        <Button
          size="sm"
          variant="flat"
          onPress={() => {
            void navigator.clipboard.writeText(json);
          }}
        >
          <Copy className="h-3 w-3" />
          复制 JSON
        </Button>
      </div>
      <pre className="bg-muted/30 max-h-96 overflow-auto p-3 text-xs whitespace-pre-wrap">
        {json}
      </pre>
    </div>
  );
}
