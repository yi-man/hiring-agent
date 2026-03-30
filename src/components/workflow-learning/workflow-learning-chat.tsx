'use client';

import { useCallback, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button, Card, CardBody, Input } from '@/components/ui';
import { streamWorkflowLearningMessage } from '@/lib/workflow-learning/client';
import { WorkflowSseBuffer } from '@/lib/workflow-learning/parse-sse';
import type { WorkflowSseEvent, TaskPlan, StepStatus } from '@/lib/workflow-learning/types';

type UserRow = { id: string; role: 'user'; content: string };
type AssistantRow = {
  id: string;
  role: 'assistant';
  plan?: TaskPlan;
  trace: WorkflowSseEvent[];
  finalText?: string;
  error?: string;
};

type Row = UserRow | AssistantRow;

export function WorkflowLearningChat() {
  const [rows, setRows] = useState<Row[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
      const stream = await streamWorkflowLearningMessage(text);
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
          let plan = a.plan;
          const trace = [...a.trace];
          for (const ev of events) {
            trace.push(ev);
            if (ev.type === 'assistant_final') {
              finalText = ev.text;
            }
            if (ev.type === 'error') {
              error = ev.message;
            }
            if (ev.type === 'plan') {
              plan = ev.plan;
            }
            if (ev.type === 'plan_step_update') {
              if (plan) {
                plan = {
                  ...plan,
                  steps: plan.steps.map((s) =>
                    s.id === ev.stepId ? { ...s, status: ev.status } : s,
                  ),
                };
              }
            }
            if (ev.type === 'plan_update') {
              plan = ev.plan;
            }
          }
          next[idx] = { ...a, trace, finalText, error, plan };
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
                  {row.plan ? <PlanDisplay plan={row.plan} /> : null}
                  <CollapsibleExecutionTrace events={row.trace} />
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

function PlanDisplay({ plan }: { plan: TaskPlan }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-xs font-medium">执行计划</div>
      <ul className="space-y-1">
        {plan.steps.map((step) => (
          <li key={step.id} className="flex items-center gap-2 text-sm">
            <StepStatusIcon status={step.status} />
            <span className={step.status === 'completed' ? 'text-muted-foreground' : ''}>
              {step.description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepStatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'pending':
      return <span className="text-muted-foreground h-4 w-4 text-center text-xs">○</span>;
    case 'running':
      return <Loader2 className="text-primary h-4 w-4 animate-spin" />;
    case 'completed':
      return <span className="h-4 w-4 text-center text-xs text-emerald-500">✓</span>;
    case 'failed':
      return <span className="text-destructive h-4 w-4 text-center text-xs">✗</span>;
    case 'waiting_user':
      return <span className="h-4 w-4 text-center text-xs text-amber-500">⏸</span>;
  }
}

function CollapsibleExecutionTrace({ events }: { events: WorkflowSseEvent[] }) {
  const [collapsed, setCollapsed] = useState(true);
  const toolCount = events.filter(
    (e) => e.type === 'tool_call_start' || e.type === 'tool_call_result',
  ).length;
  const hasTrace = toolCount > 0 || events.some((e) => e.type === 'run_start');
  if (!hasTrace) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium transition-colors"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="inline-block w-3 text-center">{collapsed ? '▶' : '▼'}</span>
        {collapsed ? `执行轨迹（${toolCount} 个工具调用）` : '执行轨迹'}
      </button>
      {!collapsed && (
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
            if (ev.type === 'user_action_required') {
              return (
                <li
                  key={`user-action-req-${i}`}
                  className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"
                >
                  <span className="font-medium text-amber-600">⏸ 需要用户操作：</span> {ev.reason}
                </li>
              );
            }
            if (ev.type === 'user_action_resolved') {
              return (
                <li
                  key={`user-action-res-${i}`}
                  className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600"
                >
                  ✓ 用户操作已完成
                </li>
              );
            }
            return null;
          })}
        </ul>
      )}
    </div>
  );
}
