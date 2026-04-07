'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button, Card, CardBody, Input } from '@/components/ui';
import {
  createWorkflowRecord,
  fetchWorkflows,
  generateWorkflowJson,
  runWorkflow,
  streamWorkflowLearningMessage,
} from '@/lib/workflow-learning/client';
import { WorkflowSseBuffer } from '@/lib/workflow-learning/parse-sse';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';

type UserRow = { id: string; role: 'user'; content: string };
type AssistantRow = {
  id: string;
  role: 'assistant';
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
  const [workflowName, setWorkflowName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedSteps, setGeneratedSteps] = useState<Array<{
    id: string;
    tool: string;
    args: Record<string, unknown>;
    description: string;
    canBatch: boolean;
    successCondition?: string;
  }> | null>(null);
  const [generatedGoal, setGeneratedGoal] = useState('');
  const [workflows, setWorkflows] = useState<
    Array<{ id: string; name: string; goal: string; version: number; updatedAt: string }>
  >([]);
  const [runSummary, setRunSummary] = useState<string | null>(null);
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
          const trace = [...a.trace];
          for (const ev of events) {
            trace.push(ev);
            if (ev.type === 'assistant_final') {
              finalText = ev.text;
            }
            if (ev.type === 'error') {
              error = ev.message;
            }
          }
          next[idx] = { ...a, trace, finalText, error };
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

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetchWorkflows();
      setWorkflows(res.workflows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载 workflow 失败';
      setClientError(msg);
    }
  }, []);

  const onGenerateWorkflow = useCallback(async () => {
    const goal = input.trim();
    if (!goal) return;
    setIsGenerating(true);
    setClientError(null);
    setRunSummary(null);
    try {
      const res = await generateWorkflowJson(goal);
      setGeneratedGoal(res.goal);
      setGeneratedSteps(res.steps);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成 workflow 失败';
      setClientError(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [input]);

  const onSaveWorkflow = useCallback(async () => {
    if (!generatedSteps || !generatedGoal || !workflowName.trim()) return;
    setIsSaving(true);
    setClientError(null);
    try {
      await createWorkflowRecord({
        name: workflowName.trim(),
        goal: generatedGoal,
        steps: generatedSteps,
      });
      setWorkflowName('');
      await loadWorkflows();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存 workflow 失败';
      setClientError(msg);
    } finally {
      setIsSaving(false);
    }
  }, [generatedGoal, generatedSteps, loadWorkflows, workflowName]);

  const onRunWorkflow = useCallback(
    async (workflowId: string) => {
      setRunSummary(null);
      setClientError(null);
      try {
        const res = await runWorkflow(workflowId);
        const status = res.result.success ? '成功' : '失败';
        const recovered = res.result.recovered ? '，已触发并完成自愈流程' : '';
        const err = res.result.error ? `，错误：${res.result.error}` : '';
        setRunSummary(`Run ${res.result.runId}：${status}${recovered}${err}`);
        await loadWorkflows();
      } catch (e) {
        const msg = e instanceof Error ? e.message : '执行 workflow 失败';
        setClientError(msg);
      }
    },
    [loadWorkflows],
  );

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

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
        <Button
          aria-label="生成 Workflow JSON"
          isDisabled={isGenerating || isRunning || !input.trim()}
          onPress={() => void onGenerateWorkflow()}
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : '生成Workflow'}
        </Button>
      </div>

      <Card className="border-border border">
        <CardBody className="gap-3">
          <div className="text-sm font-medium">Workflow JSON</div>
          <Input
            value={workflowName}
            onValueChange={setWorkflowName}
            aria-label="Workflow 名称"
            placeholder="输入 workflow 名称后保存"
          />
          {generatedSteps ? (
            <pre className="bg-muted/40 max-h-64 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
              {JSON.stringify(generatedSteps, null, 2)}
            </pre>
          ) : (
            <div className="text-muted-foreground text-xs">
              输入目标后点击「生成Workflow」，拿到 JSON 后可保存并执行。
            </div>
          )}
          <div className="flex justify-end">
            <Button
              color="primary"
              isDisabled={isSaving || !generatedSteps || !workflowName.trim()}
              onPress={() => void onSaveWorkflow()}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存 Workflow'}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="border-border border">
        <CardBody className="gap-3">
          <div className="text-sm font-medium">已保存 Workflows</div>
          {runSummary ? <div className="text-xs text-emerald-600">{runSummary}</div> : null}
          {workflows.length === 0 ? (
            <div className="text-muted-foreground text-xs">暂无已保存 workflow。</div>
          ) : (
            <ul className="space-y-2">
              {workflows.map((w) => (
                <li
                  key={w.id}
                  className="border-border flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {w.name} <span className="text-muted-foreground">v{w.version}</span>
                    </div>
                    <div className="text-muted-foreground truncate text-xs">{w.goal}</div>
                  </div>
                  <Button size="sm" onPress={() => void onRunWorkflow(w.id)}>
                    执行
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function ExecutionTrace({ events }: { events: WorkflowSseEvent[] }) {
  const tools = events.filter((e) => e.type === 'tool_call_start' || e.type === 'tool_call_result');
  if (tools.length === 0 && !events.some((e) => e.type === 'run_start')) {
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
          return null;
        })}
      </ul>
    </div>
  );
}
