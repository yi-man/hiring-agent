import type {
  CreateJobDescriptionRequest,
  JD,
  JDAgentResponse,
  JobDescriptionLifecycleRequest,
  JDStatus,
  JDTone,
  RegenerateJobDescriptionRequest,
  UpdateJobDescriptionRequest,
} from '@/types';
import { JD_STATUSES } from '@/types';

const TONES: readonly JDTone[] = ['startup', 'tech', 'formal'];

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanText(item))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isHiringTarget(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 1 && value <= 999;
}

export function isJDTone(value: unknown): value is JDTone {
  return typeof value === 'string' && TONES.includes(value as JDTone);
}

export function isJDStatus(value: unknown): value is JDStatus {
  return typeof value === 'string' && JD_STATUSES.includes(value as JDStatus);
}

export function isEditableJobDescriptionStatus(status: string): boolean {
  return status === 'created' || status === 'ready_to_publish' || status === 'publish_failed';
}

export function isJDContent(value: unknown): value is JD {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.title === 'string' &&
    typeof value.summary === 'string' &&
    isStringArray(value.responsibilities) &&
    isStringArray(value.requirements) &&
    isStringArray(value.bonus) &&
    isStringArray(value.highlights)
  );
}

export function parseCreateJobDescriptionPayload(
  body: unknown,
): ValidationResult<CreateJobDescriptionRequest & { tone: JDTone }> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  const department = cleanText(body.department);
  const position = cleanText(body.position);
  const positionDescription = cleanText(body.positionDescription);
  const salaryRange = cleanText(body.salaryRange);
  const workLocations = cleanStringList(body.workLocations);
  const tone = body.tone === undefined ? 'tech' : body.tone;
  if (!department) return { ok: false, error: 'department is required' };
  if (!position) return { ok: false, error: 'position is required' };
  if (!positionDescription) return { ok: false, error: 'positionDescription is required' };
  if (!isJDTone(tone)) {
    return { ok: false, error: 'tone is invalid' };
  }
  if (!salaryRange) return { ok: false, error: 'salaryRange is required' };
  if (workLocations.length === 0) {
    return { ok: false, error: 'at least one work location is required' };
  }

  const interviewProcessId = cleanText(body.interviewProcessId) || undefined;

  return {
    ok: true,
    value: {
      department,
      position,
      positionDescription,
      salaryRange,
      workLocations,
      tone,
      ...(interviewProcessId ? { interviewProcessId } : {}),
    },
  };
}

export function parseUpdateJobDescriptionPayload(
  body: unknown,
): ValidationResult<UpdateJobDescriptionRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  const value: UpdateJobDescriptionRequest = {};
  if (body.department !== undefined) {
    const department = cleanText(body.department);
    if (!department) return { ok: false, error: 'department must not be empty' };
    value.department = department;
  }
  if (body.position !== undefined) {
    const position = cleanText(body.position);
    if (!position) return { ok: false, error: 'position must not be empty' };
    value.position = position;
  }
  if (body.positionDescription !== undefined) {
    const positionDescription = cleanText(body.positionDescription);
    if (!positionDescription) return { ok: false, error: 'positionDescription must not be empty' };
    value.positionDescription = positionDescription;
  }
  if (body.salaryRange !== undefined) {
    if (body.salaryRange === null) {
      value.salaryRange = null;
    } else {
      const salaryRange = cleanText(body.salaryRange);
      if (!salaryRange) return { ok: false, error: 'salaryRange must not be empty' };
      value.salaryRange = salaryRange;
    }
  }
  if (body.workLocations !== undefined) {
    const workLocations = cleanStringList(body.workLocations);
    if (workLocations.length === 0) {
      return { ok: false, error: 'at least one work location is required' };
    }
    value.workLocations = workLocations;
  }
  if (body.hiringTarget !== undefined) {
    if (!isHiringTarget(body.hiringTarget)) {
      return { ok: false, error: 'hiringTarget must be an integer between 1 and 999' };
    }
    value.hiringTarget = body.hiringTarget;
  }
  if (body.tone !== undefined) {
    if (!isJDTone(body.tone)) return { ok: false, error: 'tone is invalid' };
    value.tone = body.tone;
  }
  if (body.status !== undefined) {
    if (!isJDStatus(body.status)) return { ok: false, error: 'status is invalid' };
    if (body.status !== 'ready_to_publish') {
      return { ok: false, error: 'status can only be set to ready_to_publish' };
    }
    value.status = body.status;
  }
  if (body.content !== undefined) {
    if (!isJDContent(body.content)) return { ok: false, error: 'content is invalid' };
    value.content = body.content;
  }
  if (body.evaluation !== undefined) {
    value.evaluation = body.evaluation as UpdateJobDescriptionRequest['evaluation'];
  }
  if (body.generationMeta !== undefined) {
    value.generationMeta = body.generationMeta as JDAgentResponse['meta'] | null;
  }
  if (body.interviewProcessId !== undefined) {
    if (body.interviewProcessId === null) {
      value.interviewProcessId = null;
    } else {
      const interviewProcessId = cleanText(body.interviewProcessId);
      if (!interviewProcessId) {
        return { ok: false, error: 'interviewProcessId must not be empty' };
      }
      value.interviewProcessId = interviewProcessId;
    }
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: 'at least one field is required' };
  }
  return { ok: true, value };
}

export function parseJobDescriptionLifecyclePayload(
  body: unknown,
): ValidationResult<JobDescriptionLifecycleRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid JSON body' };
  }

  if (body.action === 'take_offline') {
    return { ok: true, value: { action: 'take_offline' } };
  }
  if (body.action === 'archive') {
    return { ok: true, value: { action: 'archive' } };
  }
  if (body.action === 'reopen') {
    if (body.hiringTarget !== undefined && !isHiringTarget(body.hiringTarget)) {
      return { ok: false, error: 'hiringTarget must be an integer between 1 and 999' };
    }
    return {
      ok: true,
      value:
        body.hiringTarget === undefined
          ? { action: 'reopen' }
          : { action: 'reopen', hiringTarget: body.hiringTarget as number },
    };
  }
  if (body.action === 'set_hiring_target') {
    if (!isHiringTarget(body.hiringTarget)) {
      return { ok: false, error: 'hiringTarget must be an integer between 1 and 999' };
    }
    return {
      ok: true,
      value: { action: 'set_hiring_target', hiringTarget: body.hiringTarget },
    };
  }

  return { ok: false, error: 'action is invalid' };
}

export function parseRegenerateJobDescriptionPayload(
  body: unknown,
  fallbackTone: JDTone,
): ValidationResult<RegenerateJobDescriptionRequest & { tone: JDTone }> {
  if (!isRecord(body)) {
    return { ok: true, value: { extraInstruction: '', tone: fallbackTone } };
  }

  const tone = body.tone === undefined ? fallbackTone : body.tone;
  if (!isJDTone(tone)) {
    return { ok: false, error: 'tone is invalid' };
  }
  if (body.currentJd !== undefined && !isJDContent(body.currentJd)) {
    return { ok: false, error: 'currentJd is invalid' };
  }
  const currentJd = body.currentJd === undefined ? undefined : (body.currentJd as JD);
  return {
    ok: true,
    value: {
      currentJd,
      extraInstruction: cleanText(body.extraInstruction),
      tone,
    },
  };
}

export function composeJDJobInput(params: {
  department: string;
  position: string;
  positionDescription: string;
  salaryRange?: string | null;
  workLocations?: string[];
}): string {
  return [
    `职位：${params.position}`,
    `部门：${params.department}`,
    params.salaryRange ? `薪资范围：${params.salaryRange}` : null,
    params.workLocations?.length ? `工作地点：${params.workLocations.join('、')}` : null,
    '职位说明：',
    params.positionDescription,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n');
}
