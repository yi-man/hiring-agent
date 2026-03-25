'use client';

import { useMemo, useState } from 'react';
import type { JD, JDTone } from '@/types';

type ApiPayload = {
  success: boolean;
  message?: string;
  data?: {
    jd: JD;
  };
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
      throw new Error(result.message || '请求失败');
    }
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

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
