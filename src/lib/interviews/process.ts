import type {
  CandidateInterviewAssignment,
  InterviewProcess,
  InterviewProcessAutoMatch,
  InterviewProcessStage,
} from './types';
import { DEFAULT_INTERVIEW_PROCESSES } from './defaults';

export const PHONE_SCREEN_STAGE: InterviewProcessStage = {
  id: 'phone_screen',
  name: '电话沟通',
  purpose: '确认候选人的基本意愿、关键信息与岗位匹配前提',
  sortOrder: -1,
};

export const LEGACY_INTERVIEW_PROCESS: InterviewProcess = {
  id: 'legacy-default',
  positionType: '通用职位',
  stages: [
    {
      id: 'first_interview',
      name: '一面',
      purpose: '验证岗位基础能力与关键经历',
      sortOrder: 0,
    },
    {
      id: 'second_interview',
      name: '二面',
      purpose: '深入验证专业能力、问题解决与协作方式',
      sortOrder: 1,
    },
    {
      id: 'final_interview',
      name: '终面',
      purpose: '确认岗位动机、团队匹配与最终录用风险',
      sortOrder: 2,
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(cleanText)
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);
}

function normalizeAutoMatch(value: unknown): InterviewProcessAutoMatch {
  if (!isRecord(value)) {
    return { departments: [], positionKeywords: [], isFallback: false };
  }
  return {
    departments: cleanTextList(value.departments),
    positionKeywords: cleanTextList(value.positionKeywords),
    isFallback: value.isFallback === true,
  };
}

export function normalizeInterviewProcess(value: unknown): InterviewProcess | null {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id);
  const positionType = cleanText(value.positionType);
  if (!id || !positionType || !Array.isArray(value.stages) || value.stages.length === 0) {
    return null;
  }

  const stages = value.stages.flatMap<InterviewProcessStage>((stage, index) => {
    if (!isRecord(stage)) return [];
    const stageId = cleanText(stage.id);
    const name = cleanText(stage.name);
    const purpose = cleanText(stage.purpose);
    if (!stageId || !name || !purpose) return [];
    return [{ id: stageId, name, purpose, sortOrder: index }];
  });
  if (
    stages.length !== value.stages.length ||
    new Set(stages.map((stage) => stage.id)).size !== stages.length
  ) {
    return null;
  }

  return { id, positionType, autoMatch: normalizeAutoMatch(value.autoMatch), stages };
}

export function normalizeInterviewProcesses(value: unknown): InterviewProcess[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((process) => {
    const normalized = normalizeInterviewProcess(process);
    return normalized ? [normalized] : [];
  });
}

function cloneInterviewProcess(process: InterviewProcess): InterviewProcess {
  return {
    ...process,
    autoMatch: {
      departments: [...(process.autoMatch?.departments ?? [])],
      positionKeywords: [...(process.autoMatch?.positionKeywords ?? [])],
      isFallback: process.autoMatch?.isFallback === true,
    },
    stages: process.stages.map((stage) => ({ ...stage })),
  };
}

export function getEffectiveInterviewProcesses(
  processes: readonly InterviewProcess[] | null | undefined,
): InterviewProcess[] {
  const configured = normalizeInterviewProcesses(processes);
  const source = configured.length > 0 ? configured : DEFAULT_INTERVIEW_PROCESSES;
  return source.map(cloneInterviewProcess);
}

export type InterviewProcessMatchReason =
  | 'department'
  | 'position_keyword'
  | 'description_keyword'
  | 'fallback'
  | 'first_configured';

export type InterviewProcessMatch = {
  process: InterviewProcess;
  reason: InterviewProcessMatchReason;
  matchedValue: string | null;
};

function includesText(value: string, candidate: string) {
  const normalizedValue = value.toLocaleLowerCase();
  const normalizedCandidate = candidate.toLocaleLowerCase();
  return normalizedValue.includes(normalizedCandidate);
}

export function matchInterviewProcess(
  processes: readonly InterviewProcess[],
  input: { department: string; position: string; positionDescription?: string },
): InterviewProcessMatch | null {
  let best:
    | (InterviewProcessMatch & {
        score: number;
      })
    | null = null;

  for (const process of processes) {
    const departments = process.autoMatch?.departments ?? [];
    const department = departments.find((item) => includesText(input.department, item));
    if (department) {
      const candidate = {
        process,
        reason: 'department' as const,
        matchedValue: department,
        score: 1_000 + department.length,
      };
      if (!best || candidate.score > best.score) best = candidate;
      continue;
    }

    const keywords = process.autoMatch?.positionKeywords ?? [];
    const positionKeyword = keywords.find((item) => includesText(input.position, item));
    if (positionKeyword) {
      const candidate = {
        process,
        reason: 'position_keyword' as const,
        matchedValue: positionKeyword,
        score: 500 + positionKeyword.length,
      };
      if (!best || candidate.score > best.score) best = candidate;
      continue;
    }

    const descriptionKeyword = keywords.find((item) =>
      includesText(input.positionDescription ?? '', item),
    );
    if (descriptionKeyword) {
      const candidate = {
        process,
        reason: 'description_keyword' as const,
        matchedValue: descriptionKeyword,
        score: 100 + descriptionKeyword.length,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
  }

  if (best) {
    return {
      process: best.process,
      reason: best.reason,
      matchedValue: best.matchedValue,
    };
  }

  const fallback = processes.find((process) => process.autoMatch?.isFallback);
  if (fallback) return { process: fallback, reason: 'fallback', matchedValue: null };
  const first = processes[0];
  return first ? { process: first, reason: 'first_configured', matchedValue: null } : null;
}

export function getFormalInterviewStages(
  process: InterviewProcess | null | undefined,
): InterviewProcessStage[] {
  return process?.stages.length ? process.stages : LEGACY_INTERVIEW_PROCESS.stages;
}

export function getRequiredInterviewStages(
  process: InterviewProcess | null | undefined,
): InterviewProcessStage[] {
  return [PHONE_SCREEN_STAGE, ...getFormalInterviewStages(process)];
}

export function getInterviewStageLabel(
  stage: string,
  process: InterviewProcess | null | undefined,
): string {
  return getRequiredInterviewStages(process).find((item) => item.id === stage)?.name ?? stage;
}

export function getInterviewStagePurpose(
  stage: string,
  process: InterviewProcess | null | undefined,
): string {
  return getRequiredInterviewStages(process).find((item) => item.id === stage)?.purpose ?? '';
}

export function normalizeInterviewAssignments(value: unknown): CandidateInterviewAssignment[] {
  if (!Array.isArray(value)) return [];
  const assignments: CandidateInterviewAssignment[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const stage = cleanText(item.stage);
    const interviewer = cleanText(item.interviewer);
    if (!stage || !interviewer || seen.has(stage)) continue;
    seen.add(stage);
    assignments.push({ stage, interviewer });
  }
  return assignments;
}
