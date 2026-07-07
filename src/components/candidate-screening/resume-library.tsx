'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, FileText, ListFilter, RefreshCw } from 'lucide-react';
import { Button, Chip } from '@/components/ui';
import { fetchCandidateResumeLibrary } from '@/lib/candidate-screening/client';
import type {
  CandidateResumeLibraryItemDto,
  CandidateResumeMountedJobDto,
} from '@/lib/candidate-screening/repo';
import { withReturnTarget, type ReturnTarget } from '@/lib/navigation/return-url';

function formatDateTime(value: string | null) {
  if (!value) {
    return '暂无时间';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '暂无时间';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function candidateSubtitle(item: CandidateResumeLibraryItemDto) {
  return [
    item.candidate.currentTitle,
    item.candidate.currentCompany,
    item.candidate.location,
    item.candidate.experienceYears ? `${item.candidate.experienceYears} 年经验` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function mountedCandidateHref(job: CandidateResumeMountedJobDto, returnTarget: ReturnTarget) {
  return withReturnTarget(
    `/jd-generator/${job.jobDescription.id}/candidates/${job.candidateId}`,
    returnTarget,
  );
}

function originalProfileHref(item: CandidateResumeLibraryItemDto) {
  const mountedJob = item.mountedJobs[0];
  if (mountedJob) {
    return `/api/jd/${mountedJob.jobDescription.id}/candidates/${mountedJob.candidateId}/original-profile`;
  }
  return item.candidate.profileUrl ?? item.resume.profileUrl;
}

export function ResumeLibrary() {
  const returnTarget = { href: '/resumes', label: '返回简历列表' };
  const [items, setItems] = useState<CandidateResumeLibraryItemDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadResumes(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setError('');
    try {
      setItems(await fetchCandidateResumeLibrary(200));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载简历列表失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadResumes();
  }, []);

  return (
    <div className="space-y-4">
      <div className="border-border flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">简历列表</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            汇总已抓取简历，并查看它们挂载到哪些 JD。
          </p>
        </div>
        <Button
          className="gap-2 self-start lg:self-auto"
          isDisabled={isLoading}
          type="button"
          variant="bordered"
          onClick={() => void loadResumes({ silent: true })}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          刷新
        </Button>
      </div>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <section className="border-border overflow-hidden rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListFilter className="text-muted-foreground h-4 w-4" aria-hidden />
            简历资源
          </div>
          <div className="text-muted-foreground text-xs">
            {isLoading ? '加载中' : `${items.length} 份`}
          </div>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">
            正在加载简历列表…
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground px-4 py-10 text-center text-sm">暂无简历资源。</div>
        ) : (
          <div className="divide-border divide-y">
            {items.map((item) => {
              const primaryMountedJob = item.mountedJobs[0];
              const originHref = originalProfileHref(item);
              const visibleMountedJobs = item.mountedJobs.slice(0, 3);
              const hiddenMountedJobCount = item.mountedJobs.length - visibleMountedJobs.length;
              return (
                <article
                  key={item.resume.id}
                  className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(220px,0.9fr)_120px] lg:items-start"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="min-w-0">
                      {primaryMountedJob ? (
                        <Link
                          className="text-foreground block truncate text-sm font-medium hover:underline"
                          href={mountedCandidateHref(primaryMountedJob, returnTarget)}
                        >
                          {item.candidate.displayName}
                        </Link>
                      ) : (
                        <div className="text-foreground truncate text-sm font-medium">
                          {item.candidate.displayName}
                        </div>
                      )}
                      <div className="text-muted-foreground mt-1 truncate text-xs">
                        {candidateSubtitle(item) || '候选人信息待补充'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Chip size="sm" variant="flat">
                        {item.resume.sourcePlatform}
                      </Chip>
                      <span className="text-muted-foreground">
                        抓取于 {formatDateTime(item.resume.fetchedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-1 text-xs">简历摘要</div>
                    <p className="text-foreground line-clamp-3 text-sm leading-6">
                      {item.resume.rawText || '暂无简历摘要'}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <div className="text-muted-foreground mb-2 text-xs">挂载 JD</div>
                    {item.mountedJobs.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {visibleMountedJobs.map((job) => (
                          <div
                            key={job.screeningResultId}
                            className="border-border bg-muted/40 inline-flex max-w-full flex-col gap-1 rounded-md border px-2.5 py-2"
                          >
                            <Link
                              className="text-foreground inline-flex max-w-full items-center gap-2 text-xs hover:underline"
                              href={withReturnTarget(
                                `/jd-generator/${job.jobDescription.id}`,
                                returnTarget,
                              )}
                            >
                              <span className="truncate">{job.jobDescription.title}</span>
                              <span className="text-muted-foreground font-mono" aria-hidden>
                                {Math.round(job.finalScore)}
                              </span>
                            </Link>
                            <Link
                              aria-label={`查看 ${job.jobDescription.title} 的候选人详情`}
                              className="text-muted-foreground text-xs hover:underline"
                              href={mountedCandidateHref(job, returnTarget)}
                            >
                              候选人详情
                            </Link>
                          </div>
                        ))}
                        {hiddenMountedJobCount > 0 ? (
                          <span className="border-border text-muted-foreground inline-flex items-center rounded-md border px-2.5 py-1 text-xs">
                            +{hiddenMountedJobCount} 个
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">未挂载 JD</span>
                    )}
                  </div>

                  <div className="flex lg:justify-end">
                    {originHref ? (
                      <Link
                        className="border-input bg-background text-foreground hover:bg-muted inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium"
                        href={originHref}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden />
                        查看原站
                      </Link>
                    ) : (
                      <Button className="gap-2" isDisabled type="button" variant="bordered">
                        <ExternalLink className="h-4 w-4" aria-hidden />
                        无原站链接
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
