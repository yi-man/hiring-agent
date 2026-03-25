'use client';

import { useMemo, useState } from 'react';
import type { JDAgentResponse, JDAgentTimingMeta, JDAgentTokenMeta, JD, JDTone } from '@/types';

type ApiPayload = {
  success: boolean;
  message?: string;
  data?: JDAgentResponse;
};

const emptyJd: JD = {
  title: '',
  summary: '',
  responsibilities: [],
  requirements: [],
  bonus: [],
  highlights: [],
};

export function JDGeneratorWorkbench() {
  const [jobInput, setJobInput] = useState('');
  const [tone, setTone] = useState<JDTone>('tech');
  const [extraInstruction, setExtraInstruction] = useState('');
  const [jd, setJd] = useState<JD>(emptyJd);
  const [error, setError] = useState('');
  const [timing, setTiming] = useState<JDAgentTimingMeta | null>(null);
  const [tokens, setTokens] = useState<JDAgentTokenMeta | null>(null);
  const [loading, setLoading] = useState<'idle' | 'generating' | 'continuing'>('idle');

  const hasJd = useMemo(() => Boolean(jd.title || jd.summary), [jd]);

  async function callAgent(payload: object) {
    const response = await fetch('/api/jd/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as ApiPayload;
    if (!response.ok || !result.success || !result.data) {
      setTiming(null);
      setTokens(null);
      throw new Error(result.message || '请求失败');
    }
    setTiming(result.data.meta.timing ?? null);
    setTokens(result.data.meta.tokens ?? null);
    return result.data.jd;
  }

  async function onGenerate() {
    try {
      setError('');
      setLoading('generating');
      const nextJd = await callAgent({ action: 'initial_generate', jobInput, tone });
      setJd(nextJd);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setLoading('idle');
    }
  }

  async function onContinue() {
    try {
      setError('');
      setLoading('continuing');
      const nextJd = await callAgent({
        action: 'continue_generate',
        currentJd: jd,
        extraInstruction,
        tone,
      });
      setJd(nextJd);
    } catch (e) {
      setError(e instanceof Error ? e.message : '继续生成失败');
    } finally {
      setLoading('idle');
    }
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-24">
      <h1 className="text-3xl font-bold">JD 生成 Agent</h1>

      <section className="space-y-3 rounded-lg border p-4">
        <label className="block text-sm font-medium">要创建什么岗位</label>
        <textarea
          aria-label="要创建什么岗位"
          className="w-full rounded-md border p-3"
          rows={5}
          value={jobInput}
          onChange={(e) => setJobInput(e.target.value)}
          placeholder="例如：招聘高级前端工程师，负责增长业务..."
        />
        <div className="flex items-center gap-2">
          <label htmlFor="tone" className="text-sm">
            风格
          </label>
          <select
            id="tone"
            value={tone}
            onChange={(e) => setTone(e.target.value as JDTone)}
            className="rounded-md border px-2 py-1"
          >
            <option value="tech">tech</option>
            <option value="startup">startup</option>
            <option value="formal">formal</option>
          </select>
        </div>
        <button
          type="button"
          className="rounded-md bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={loading !== 'idle' || !jobInput.trim()}
          onClick={onGenerate}
        >
          {loading === 'generating' ? '生成中...' : '生成 JD'}
        </button>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <label className="block text-sm font-medium">JD（可编辑 JSON）</label>
        <textarea
          aria-label="JD编辑框"
          className="w-full rounded-md border p-3 font-mono"
          rows={14}
          value={JSON.stringify(jd, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value) as JD;
              setJd(parsed);
              setError('');
            } catch {
              setError('JD 需保持合法 JSON');
            }
          }}
        />
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <label className="block text-sm font-medium">追加要求（继续生成）</label>
        <textarea
          aria-label="追加要求"
          className="w-full rounded-md border p-3"
          rows={3}
          value={extraInstruction}
          onChange={(e) => setExtraInstruction(e.target.value)}
          placeholder="例如：语气更专业，强调业务价值"
        />
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={loading !== 'idle' || !hasJd}
          onClick={onContinue}
        >
          {loading === 'continuing' ? '继续生成中...' : '继续生成'}
        </button>
      </section>

      {timing ? (
        <section className="space-y-2 rounded-lg border border-dashed p-4 text-sm">
          <h2 className="font-medium">阶段耗时</h2>
          <p className="text-muted-foreground">
            合计 {(timing.totalMs / 1000).toFixed(2)}s（服务端统计）
          </p>
          <ul className="space-y-1 font-mono text-xs">
            {timing.stages.map((s, idx) => (
              <li key={`${s.id}-${idx}`} className="flex justify-between gap-4">
                <span>{s.label}</span>
                <span>{s.ms}ms</span>
              </li>
            ))}
          </ul>
          {timing.suggestions.length > 0 ? (
            <div className="space-y-1 pt-2">
              <p className="font-medium">建议</p>
              <ul className="text-muted-foreground list-inside list-disc space-y-1">
                {timing.suggestions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {tokens ? (
        <section className="space-y-2 rounded-lg border border-dashed p-4 text-sm">
          <h2 className="font-medium">Token 用量</h2>
          <p className="text-muted-foreground">
            合计 prompt {tokens.total.promptTokens} / completion {tokens.total.completionTokens} /
            total {tokens.total.totalTokens}
          </p>
          <ul className="space-y-1 font-mono text-xs">
            {tokens.stages.map((s, idx) => (
              <li key={`${s.id}-${idx}`} className="flex justify-between gap-4">
                <span>{s.label}</span>
                <span>
                  p {s.usage.promptTokens} / c {s.usage.completionTokens} / t {s.usage.totalTokens}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
