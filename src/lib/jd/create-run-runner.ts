import { runJDAgent } from '@/lib/jd-agent/service';
import { composeJDJobInput } from './api';
import {
  createJobDescriptionCreateRunEvent,
  getJobDescriptionCreateRun,
  updateJobDescriptionCreateRun,
  type JobDescriptionCreateRunDto,
  type JobDescriptionCreateRunStage,
} from './create-run-repo';
import { createJobDescription } from './job-description-repo';

type RunJobDescriptionCreateRunParams = {
  userId: string;
  runId: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'JD 生成失败';
}

async function recordEvent(params: {
  run: JobDescriptionCreateRunDto;
  stage: JobDescriptionCreateRunStage;
  message: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  detail?: Record<string, unknown> | null;
}) {
  await createJobDescriptionCreateRunEvent({
    userId: params.run.userId,
    runId: params.run.id,
    stage: params.stage,
    level: params.level,
    message: params.message,
    detail: params.detail,
  });
}

function buildRunRequest(run: JobDescriptionCreateRunDto) {
  return {
    department: run.department,
    position: run.position,
    positionDescription: run.positionDescription,
    salaryRange: run.salaryRange,
    workLocations: run.workLocations,
    tone: run.tone,
  };
}

export async function runJobDescriptionCreateRun({
  userId,
  runId,
}: RunJobDescriptionCreateRunParams): Promise<void> {
  const run = await getJobDescriptionCreateRun({ userId, runId });
  if (!run) {
    return;
  }
  if (run.status === 'success' || run.status === 'failed') {
    return;
  }

  let activeStage: JobDescriptionCreateRunStage = 'input_preparation';

  try {
    await updateJobDescriptionCreateRun({
      userId,
      runId,
      status: 'running',
      currentStage: 'input_preparation',
      errorMessage: null,
      startedAt: new Date(),
    });
    await recordEvent({
      run,
      stage: 'input_preparation',
      message: '正在整理岗位输入',
      detail: {
        department: run.department,
        position: run.position,
        salaryRange: run.salaryRange,
        workLocations: run.workLocations,
      },
    });

    const request = buildRunRequest(run);
    const jobInput = composeJDJobInput(request);
    await recordEvent({
      run,
      stage: 'input_preparation',
      level: 'success',
      message: '岗位输入已整理',
      detail: {
        inputLength: jobInput.length,
        tone: run.tone,
      },
    });

    activeStage = 'llm_generation';
    await updateJobDescriptionCreateRun({
      userId,
      runId,
      status: 'running',
      currentStage: activeStage,
    });
    await recordEvent({
      run,
      stage: activeStage,
      message: '正在检索公司上下文并生成 JD 内容',
      detail: {
        promptPreview: jobInput.slice(0, 240),
      },
    });

    const agentResponse = await runJDAgent(
      {
        action: 'initial_generate',
        jobInput,
        tone: run.tone,
      },
      { userId },
    );
    await recordEvent({
      run,
      stage: activeStage,
      level: 'success',
      message: 'JD 内容生成完成',
      detail: {
        title: agentResponse.jd.title,
        model: agentResponse.meta.model,
        promptVersion: agentResponse.meta.promptVersion,
        totalMs: agentResponse.meta.timing?.totalMs ?? null,
        tokenTotal: agentResponse.meta.tokens?.total.totalTokens ?? null,
        contextUsed: agentResponse.meta.context?.used ?? false,
        contextSources: agentResponse.meta.context?.matches.length ?? 0,
        timingStages: agentResponse.meta.timing?.stages ?? [],
        warnings: agentResponse.warnings ?? agentResponse.meta.context?.warnings ?? [],
      },
    });

    activeStage = 'saving';
    await updateJobDescriptionCreateRun({
      userId,
      runId,
      status: 'running',
      currentStage: activeStage,
    });
    await recordEvent({
      run,
      stage: activeStage,
      message: '正在保存 JD 到工作台',
    });

    const jobDescription = await createJobDescription({
      userId,
      department: run.department,
      position: run.position,
      positionDescription: run.positionDescription,
      salaryRange: run.salaryRange,
      workLocations: run.workLocations,
      tone: run.tone,
      content: agentResponse.jd,
      evaluation: agentResponse.evaluation,
      generationMeta: agentResponse.meta,
      interviewProcess: run.interviewProcess,
    });
    await recordEvent({
      run,
      stage: activeStage,
      level: 'success',
      message: 'JD 已保存到工作台',
      detail: {
        jobDescriptionId: jobDescription.id,
        status: jobDescription.status,
      },
    });

    activeStage = 'completed';
    await updateJobDescriptionCreateRun({
      userId,
      runId,
      jobDescriptionId: jobDescription.id,
      status: 'success',
      currentStage: activeStage,
      errorMessage: null,
      finishedAt: new Date(),
    });
    await recordEvent({
      run,
      stage: activeStage,
      level: 'success',
      message: 'JD 创建完成',
      detail: { jobDescriptionId: jobDescription.id },
    });
  } catch (error) {
    const message = errorMessage(error);
    await updateJobDescriptionCreateRun({
      userId,
      runId,
      status: 'failed',
      currentStage: activeStage,
      errorMessage: message,
      finishedAt: new Date(),
    });
    await recordEvent({
      run,
      stage: activeStage,
      level: 'error',
      message,
    });
  }
}
