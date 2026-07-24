'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BrainCircuit, CheckCircle2, CircleDot, Loader2, RefreshCw } from 'lucide-react';
import { Button, Card, CardBody, Chip } from '@/components/ui';
import {
  evaluateJdCandidateDecision,
  fetchCandidateInterviewFeedbacks,
  fetchJdCandidateDetail,
} from '@/lib/candidate-screening/client';
import { fetchJobDescription } from '@/lib/jd/client';
import { getCandidateEvaluationDimension } from '@/lib/candidate-screening/evaluation-dimensions';
import type {
  CandidateDecisionResultDto,
  CandidateInterviewFeedbackDto,
  CandidateScreeningDetailDto,
} from '@/lib/candidate-screening/repo';
import { feedbackDecisionLabels } from '@/components/candidate-screening/interview-display';
import { getInterviewStageLabel, getRequiredInterviewStages } from '@/lib/interviews/process';

type DecisionRunStatus = 'running' | 'success' | 'failed';
type DecisionRunLogLevel = 'info' | 'success' | 'error';

type DecisionRunLog = {
  id: number;
  level: DecisionRunLogLevel;
  message: string;
  detail: string;
  time: string;
  sections?: Array<{
    title: string;
    rows: Array<{ label: string; value: string }>;
  }>;
  defaultExpanded?: boolean;
};

const hireDecisionLabels: Record<CandidateDecisionResultDto['hireDecision'], string> = {
  strong_yes: '强烈建议录用',
  yes: '建议录用',
  no: '暂不录用',
};

function formatFeedbackDimensionRatings(feedback: CandidateInterviewFeedbackDto) {
  if (feedback.dimensionRatings.length === 0) return '历史评价未拆分胜任力维度';
  return feedback.dimensionRatings
    .map((rating) => {
      const dimension = getCandidateEvaluationDimension(rating.dimension);
      return `${dimension.label} ${rating.score}/5：${rating.evidence}`;
    })
    .join('；');
}

function currentTime() {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function CandidateDecisionRun({
  jobDescriptionId,
  candidateId,
}: {
  jobDescriptionId: string;
  candidateId: string;
}) {
  const [candidate, setCandidate] = useState<CandidateScreeningDetailDto | null>(null);
  const [decision, setDecision] = useState<CandidateDecisionResultDto | null>(null);
  const [status, setStatus] = useState<DecisionRunStatus>('running');
  const [logs, setLogs] = useState<DecisionRunLog[]>([]);
  const [error, setError] = useState('');
  const [runVersion, setRunVersion] = useState(0);
  const interviewHref = `/jd-generator/${jobDescriptionId}/candidates/${candidateId}/interview`;

  useEffect(() => {
    let active = true;

    function appendLog(
      level: DecisionRunLogLevel,
      message: string,
      detail: string,
      options?: Pick<DecisionRunLog, 'sections' | 'defaultExpanded'>,
    ) {
      if (!active) return;
      setLogs((current) => {
        const id = current.length + 1;
        return [...current, { id, level, message, detail, time: currentTime(), ...options }];
      });
    }

    async function execute() {
      setStatus('running');
      setDecision(null);
      setError('');
      setLogs([]);
      appendLog('info', '开始执行录用建议', `候选人 ${candidateId}`);

      try {
        appendLog('info', '加载候选人与面试反馈', '并行读取 JD、候选人资料和结构化评价');
        const [jobDescription, nextCandidate, feedbacks] = await Promise.all([
          fetchJobDescription(jobDescriptionId),
          fetchJdCandidateDetail(jobDescriptionId, candidateId),
          fetchCandidateInterviewFeedbacks(jobDescriptionId, candidateId),
        ]);
        if (!active) return;
        setCandidate(nextCandidate);
        const requiredInterviewStages = getRequiredInterviewStages(jobDescription.interviewProcess);
        appendLog(
          'success',
          '面试上下文加载完成',
          `${nextCandidate.candidate.displayName} · ${feedbacks.length}/${requiredInterviewStages.length} 轮评价`,
          {
            defaultExpanded: true,
            sections: [
              {
                title: '岗位上下文',
                rows: [
                  { label: '职位', value: jobDescription.position },
                  { label: '职位描述', value: jobDescription.positionDescription },
                  {
                    label: '核心要求',
                    value: jobDescription.content.requirements.join('、') || '暂无',
                  },
                  {
                    label: '岗位职责',
                    value: jobDescription.content.responsibilities.join('、') || '暂无',
                  },
                ],
              },
              {
                title: '候选人上下文',
                rows: [
                  { label: '姓名', value: nextCandidate.candidate.displayName },
                  {
                    label: '当前经历',
                    value:
                      [nextCandidate.candidate.currentTitle, nextCandidate.candidate.currentCompany]
                        .filter(Boolean)
                        .join(' · ') || '暂无',
                  },
                  { label: '简历筛选分', value: `${nextCandidate.finalScore}/100` },
                  {
                    label: '技能与领域',
                    value:
                      [
                        ...nextCandidate.tags.skills,
                        ...nextCandidate.tags.domainKnowledge,
                        ...nextCandidate.tags.generalAbility,
                      ].join('、') || '暂无',
                  },
                  {
                    label: '面试备注',
                    value: nextCandidate.notes || '暂无',
                  },
                ],
              },
              {
                title: '评价证据上下文',
                rows: feedbacks.map((feedback) => ({
                  label: getInterviewStageLabel(feedback.stage, jobDescription.interviewProcess),
                  value: `${getInterviewStageLabel(feedback.stage, jobDescription.interviewProcess)} · ${feedback.rating}/5 · ${feedbackDecisionLabels[feedback.decision]} · 维度证据：${formatFeedbackDimensionRatings(feedback)}${feedback.pros.length > 0 ? ` · 优势：${feedback.pros.join('、')}` : ''}${feedback.cons.length > 0 ? ` · 待确认：${feedback.cons.join('、')}` : ''}${feedback.notes ? ` · 备注：${feedback.notes}` : ''}`,
                })),
              },
            ],
          },
        );

        if (feedbacks.length === 0) {
          throw new Error('至少完成一轮结构化评价后才能生成建议');
        }

        const completedStages = new Set(feedbacks.map((feedback) => feedback.stage));
        const missingStages = requiredInterviewStages.filter(
          (stage) => !completedStages.has(stage.id),
        );
        appendLog(
          'success',
          '结构化证据校验完成',
          missingStages.length === 0
            ? `${requiredInterviewStages.map((stage) => stage.name).join('、')}评价完整`
            : `缺少：${missingStages.map((stage) => stage.name).join('、')}`,
        );

        appendLog('info', '计算录用建议', '按统一岗位胜任力维度汇总简历、沟通与各轮面试证据');
        const nextDecision = await evaluateJdCandidateDecision(jobDescriptionId, candidateId);
        if (!active) return;
        setDecision(nextDecision);
        appendLog(
          'success',
          '各维度评分完成',
          `加权总分 ${Math.round(nextDecision.decisionTrace.weightedScore * 100)}%`,
          {
            defaultExpanded: true,
            sections: [
              {
                title: '维度评分与公式',
                rows: nextDecision.decisionTrace.formula.map((item) => ({
                  label: item.label,
                  value: `${Math.round(item.score * 100)}% × ${Math.round(item.weight * 100)}% = ${Math.round(item.contribution * 1000) / 10}% · 证据置信度 ${Math.round((nextDecision.dimensionAssessments.find((dimension) => dimension.key === item.key)?.confidence ?? 0) * 100)}%`,
                })),
              },
              {
                title: '逐维度证据与判断',
                rows: nextDecision.dimensionAssessments.map((dimension) => ({
                  label: dimension.label,
                  value: `${dimension.summary} · ${dimension.evidence.join('；')}`,
                })),
              },
              {
                title: '决策规则',
                rows: [
                  {
                    label: '加权总分',
                    value: `${Math.round(nextDecision.decisionTrace.weightedScore * 100)}%`,
                  },
                  {
                    label: '录用阈值',
                    value: `完整评价：强烈建议 ≥ ${Math.round(nextDecision.decisionTrace.thresholds.strongYes * 100)}%，建议录用 ≥ ${Math.round(nextDecision.decisionTrace.thresholds.yes * 100)}%；阶段性建议 ≥ ${Math.round(nextDecision.decisionTrace.thresholds.preliminaryYes * 100)}%`,
                  },
                  {
                    label: '强录用维度底线',
                    value: `五个岗位胜任力维度均不得低于 ${Math.round(nextDecision.decisionTrace.thresholds.strongYesDimensionFloor * 100)}%`,
                  },
                  {
                    label: '硬性淘汰',
                    value: nextDecision.decisionTrace.hardRejected ? '已触发' : '未触发',
                  },
                  {
                    label: '风险等级',
                    value: `${nextDecision.riskAnalysis.level}${nextDecision.riskAnalysis.reasons.length > 0 ? ` · ${nextDecision.riskAnalysis.reasons.join('、')}` : ' · 无明确风险'}`,
                  },
                ],
              },
            ],
          },
        );
        setStatus('success');
        appendLog(
          'success',
          '录用建议生成完成',
          `${nextDecision.decisionScope === 'final' ? '最终录用建议' : '阶段性建议'} · ${hireDecisionLabels[nextDecision.hireDecision]}`,
        );
      } catch (runError) {
        if (!active) return;
        const message = runError instanceof Error ? runError.message : '生成录用建议失败';
        setError(message);
        setStatus('failed');
        appendLog('error', '录用建议生成失败', message);
      }
    }

    void execute();
    return () => {
      active = false;
    };
  }, [candidateId, jobDescriptionId, runVersion]);

  return (
    <div className="space-y-4">
      <header className="border-border flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Button as={Link} className="mb-3 gap-2 px-0" href={interviewHref} variant="light">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回面试详情
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <BrainCircuit className="text-muted-foreground h-5 w-5" aria-hidden />
            <h1 className="text-foreground text-2xl font-semibold tracking-normal">
              录用建议执行日志
            </h1>
            <Chip
              color={status === 'success' ? 'success' : status === 'failed' ? 'danger' : 'primary'}
              size="sm"
              variant="flat"
            >
              {status === 'success' ? '已完成' : status === 'failed' ? '执行失败' : '执行中'}
            </Chip>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {candidate?.candidate.displayName ?? '正在读取候选人'} · 证据驱动的录用决策
          </p>
        </div>
        {status === 'failed' ? (
          <Button
            className="gap-2"
            color="primary"
            type="button"
            onClick={() => setRunVersion((current) => current + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            重新执行
          </Button>
        ) : null}
      </header>

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.58fr)_minmax(360px,0.42fr)]">
        <Card className="border-border rounded-lg border shadow-none">
          <CardBody className="p-0">
            <div className="border-border flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-medium">执行过程</div>
              <div className="text-muted-foreground font-mono text-xs">{logs.length} 条日志</div>
            </div>
            <ol className="divide-border divide-y">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="grid grid-cols-[24px_minmax(0,1fr)_auto] gap-3 px-4 py-4"
                >
                  <div className="pt-0.5">
                    {log.level === 'success' ? (
                      <CheckCircle2 className="text-success h-4 w-4" aria-hidden />
                    ) : log.level === 'error' ? (
                      <CircleDot className="text-destructive h-4 w-4" aria-hidden />
                    ) : (
                      <CircleDot className="text-primary h-4 w-4" aria-hidden />
                    )}
                  </div>
                  <div>
                    <p className="text-foreground text-sm font-medium">{log.message}</p>
                    <p className="text-muted-foreground mt-1 text-xs leading-5">{log.detail}</p>
                    {log.sections ? (
                      <details
                        className="border-border bg-muted/15 mt-3 rounded-md border"
                        open={log.defaultExpanded}
                      >
                        <summary className="text-muted-foreground cursor-pointer px-3 py-2 text-xs font-medium">
                          查看详细信息
                        </summary>
                        <div className="border-border space-y-3 border-t px-3 py-3">
                          {log.sections.map((section) => (
                            <section key={section.title}>
                              <h3 className="text-foreground text-xs font-semibold">
                                {section.title}
                              </h3>
                              <dl className="mt-2 space-y-2">
                                {section.rows.map((row, index) => (
                                  <div
                                    key={`${section.title}-${row.label}-${index}`}
                                    className="grid gap-1 text-xs sm:grid-cols-[88px_minmax(0,1fr)]"
                                  >
                                    <dt className="text-muted-foreground">{row.label}</dt>
                                    <dd className="text-foreground leading-5">{row.value}</dd>
                                  </div>
                                ))}
                              </dl>
                            </section>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                  <time className="text-muted-foreground font-mono text-xs">{log.time}</time>
                </li>
              ))}
              {status === 'running' ? (
                <li className="flex items-center gap-3 px-4 py-4">
                  <Loader2 className="text-primary h-4 w-4 animate-spin" aria-hidden />
                  <span className="text-muted-foreground text-sm">正在执行下一步…</span>
                </li>
              ) : null}
            </ol>
          </CardBody>
        </Card>

        <Card className="border-border rounded-lg border shadow-none">
          <CardBody className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">执行结果</div>
              {decision ? (
                <Chip
                  color={decision.decisionScope === 'final' ? 'success' : 'warning'}
                  size="sm"
                  variant="flat"
                >
                  {decision.decisionScope === 'final' ? '最终录用建议' : '阶段性建议'}
                </Chip>
              ) : null}
            </div>

            {decision ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="border-border bg-muted/20 rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">录用建议</div>
                    <div className="mt-1 text-sm font-semibold">
                      {hireDecisionLabels[decision.hireDecision]}
                    </div>
                  </div>
                  <div className="border-border bg-muted/20 rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">岗位综合匹配度</div>
                    <div className="mt-1 font-mono text-sm">
                      {Math.round(decision.decisionTrace.weightedScore * 100)}%
                    </div>
                  </div>
                  <div className="border-border bg-muted/20 rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">决策置信度</div>
                    <div className="mt-1 font-mono text-sm">
                      {Math.round(decision.confidence * 100)}%
                    </div>
                  </div>
                </div>

                <div className="border-border rounded-md border p-3">
                  <div className="text-muted-foreground text-xs">接受 Offer 概率</div>
                  <div className="mt-1 font-mono text-xl font-semibold">
                    {Math.round(decision.offerAcceptProbability * 100)}%
                  </div>
                </div>

                <div>
                  <div className="text-muted-foreground mb-2 text-xs">岗位胜任力证据</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {decision.dimensionAssessments.map((dimension) => (
                      <article key={dimension.key} className="border-border rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-foreground text-sm font-semibold">
                            {dimension.label}
                          </h3>
                          <Chip
                            color={
                              dimension.status === 'strong'
                                ? 'success'
                                : dimension.status === 'concern'
                                  ? 'danger'
                                  : 'warning'
                            }
                            size="sm"
                            variant="flat"
                          >
                            {Math.round(dimension.score * 100)}%
                          </Chip>
                        </div>
                        <p className="text-muted-foreground mt-2 text-xs leading-5">
                          {dimension.summary}
                        </p>
                        <div className="text-muted-foreground mt-2 font-mono text-[11px]">
                          证据置信度 {Math.round(dimension.confidence * 100)}%
                        </div>
                        <ul className="mt-2 space-y-1 text-xs">
                          {dimension.evidence.slice(0, 3).map((evidence) => (
                            <li key={evidence}>· {evidence}</li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DecisionEvidence title="综合优势" values={decision.strengths} />
                  <DecisionEvidence title="待确认" values={decision.weaknesses} />
                </div>

                {decision.riskAnalysis.reasons.length > 0 ? (
                  <div>
                    <div className="text-muted-foreground mb-2 text-xs">风险信号</div>
                    <div className="flex flex-wrap gap-2">
                      {decision.riskAnalysis.reasons.map((reason) => (
                        <Chip key={reason} size="sm" variant="flat">
                          {reason}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="text-muted-foreground mb-2 text-xs">下一步建议</div>
                  <ul className="space-y-2 text-sm">
                    {decision.suggestions.map((suggestion) => (
                      <li
                        key={suggestion.content}
                        className="border-border rounded-md border px-3 py-2"
                      >
                        {suggestion.content}
                      </li>
                    ))}
                  </ul>
                </div>

                <Button as={Link} className="w-full gap-2" href={interviewHref} variant="bordered">
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  返回面试详情
                </Button>
              </div>
            ) : (
              <div className="border-border bg-muted/20 rounded-md border border-dashed px-4 py-10 text-center">
                <BrainCircuit className="text-muted-foreground mx-auto h-6 w-6" aria-hidden />
                <p className="text-foreground mt-3 text-sm font-medium">
                  {status === 'failed' ? '本次执行未生成结果' : '正在生成录用建议'}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  完成证据校验和风险计算后，结果将在这里展示。
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function DecisionEvidence({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="bg-muted/20 rounded-md p-3">
      <div className="text-muted-foreground text-xs">{title}</div>
      <div className="mt-1 text-sm leading-6">{values.length > 0 ? values.join('、') : '暂无'}</div>
    </div>
  );
}
