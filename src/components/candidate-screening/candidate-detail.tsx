'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, ExternalLink, FileText, Save } from 'lucide-react';
import { Button, Card, CardBody, Chip } from '@/components/ui';
import {
  fetchJdCandidateDetail,
  updateJdCandidateProgress,
} from '@/lib/candidate-screening/client';
import { CANDIDATE_SCREENING_INTERVIEW_STAGES } from '@/lib/candidate-screening/constants';
import type { CandidateScreeningDetailDto } from '@/lib/candidate-screening/repo';
import type { CandidateInterviewStage } from '@/lib/candidate-screening/types';

export function CandidateDetail({
  jobDescriptionId,
  candidateId,
}: {
  jobDescriptionId: string;
  candidateId: string;
}) {
  const [candidate, setCandidate] = useState<CandidateScreeningDetailDto | null>(null);
  const [interviewStage, setInterviewStage] = useState<CandidateInterviewStage>('sourced');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const originalProfileHref =
    candidate?.candidate.profileUrl || candidate?.resume?.profileUrl
      ? `/api/jd/${jobDescriptionId}/candidates/${candidateId}/original-profile`
      : null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError('');
      try {
        const next = await fetchJdCandidateDetail(jobDescriptionId, candidateId);
        if (cancelled) return;
        setCandidate(next);
        setInterviewStage(next.interviewStage);
        setNotes(next.notes ?? '');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '加载候选人详情失败');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [candidateId, jobDescriptionId]);

  async function handleSaveProgress() {
    if (!candidate) return;
    setIsSaving(true);
    setError('');
    try {
      const updated = await updateJdCandidateProgress(jobDescriptionId, candidateId, {
        interviewStage,
        notes,
      });
      setCandidate({ ...candidate, ...updated });
      setInterviewStage(updated.interviewStage);
      setNotes(updated.notes ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存候选人进度失败');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground py-12 text-center text-sm">正在加载候选人…</div>;
  }

  if (!candidate) {
    return (
      <div className="space-y-4">
        <Button
          as={Link}
          className="gap-2 px-0"
          href={`/jd-generator/${jobDescriptionId}/candidates`}
          variant="light"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          返回候选人
        </Button>
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error || '候选人不存在'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Button
            as={Link}
            className="mb-3 gap-2 px-0"
            href={`/jd-generator/${jobDescriptionId}/candidates`}
            variant="light"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回候选人
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <BadgeCheck className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">
              {candidate.candidate.displayName}
            </h1>
            <Chip size="sm" variant="flat">
              {candidate.decisionAction}
            </Chip>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {[
              candidate.candidate.currentTitle,
              candidate.candidate.currentCompany,
              candidate.candidate.location,
            ]
              .filter(Boolean)
              .join(' · ') || '候选人信息待补充'}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          {originalProfileHref ? (
            <Button
              as={Link}
              className="gap-2"
              href={originalProfileHref}
              prefetch={false}
              rel="noreferrer"
              target="_blank"
              variant="bordered"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              查看原站
            </Button>
          ) : null}
          <div className="text-left lg:text-right">
            <div className="font-mono text-3xl font-semibold">
              {Math.round(candidate.finalScore)}
            </div>
            <div className="text-muted-foreground text-xs">匹配分</div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.68fr)_minmax(320px,0.32fr)]">
        <section className="space-y-4">
          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="text-muted-foreground h-4 w-4" aria-hidden />
                简历
              </div>
              <p className="text-foreground text-sm leading-6 whitespace-pre-wrap">
                {candidate.resume?.rawText ?? '暂无简历正文'}
              </p>
            </CardBody>
          </Card>

          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BadgeCheck className="text-muted-foreground h-4 w-4" aria-hidden />
                评估
              </div>
              <p className="text-foreground text-sm">{candidate.decisionReason}</p>
              <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                {[
                  ['skill', candidate.scoreDetail.skill],
                  ['domain', candidate.scoreDetail.domain],
                  ['ability', candidate.scoreDetail.ability],
                  ['risk', candidate.scoreDetail.risk],
                  ['bonus', candidate.scoreDetail.llmBonus],
                ].map(([label, value]) => (
                  <div key={label} className="border-border rounded-md border px-3 py-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-foreground mt-1 font-mono text-base">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">面试进度</div>
                <div aria-label="当前候选人进度">
                  <Chip size="sm" variant="flat">
                    {candidate.interviewStage}
                  </Chip>
                </div>
              </div>
              <label className="block space-y-2">
                <span className="text-muted-foreground text-xs">面试阶段</span>
                <select
                  aria-label="面试阶段"
                  className="border-input bg-background text-foreground h-10 w-full rounded-md border px-3 text-sm"
                  value={interviewStage}
                  onChange={(event) =>
                    setInterviewStage(event.target.value as CandidateInterviewStage)
                  }
                >
                  {CANDIDATE_SCREENING_INTERVIEW_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-muted-foreground text-xs">备注</span>
                <textarea
                  aria-label="候选人备注"
                  className="border-input bg-background text-foreground min-h-28 w-full rounded-md border px-3 py-2 text-sm"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
              <Button
                className="w-full gap-2"
                color="primary"
                isDisabled={isSaving}
                type="button"
                onClick={() => void handleSaveProgress()}
              >
                <Save className="h-4 w-4" aria-hidden />
                {isSaving ? '保存中' : '保存进度'}
              </Button>
            </CardBody>
          </Card>

          <Card className="border-border rounded-lg border shadow-none">
            <CardBody className="space-y-2 p-4">
              <div className="text-sm font-medium">动作记录</div>
              {candidate.actionLogs.length === 0 ? (
                <p className="text-muted-foreground text-sm">暂无动作记录。</p>
              ) : (
                <div className="space-y-2">
                  {candidate.actionLogs.map((log) => (
                    <div key={log.id} className="border-border rounded-md border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{log.action}</span>
                        <span className="text-muted-foreground">{log.status}</span>
                      </div>
                      {log.message ? (
                        <p className="text-muted-foreground mt-1 line-clamp-2">{log.message}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
