import { z } from 'zod';
import { invokeLlmChat } from '@/lib/llm';
import { renderManagedPrompt } from '@/lib/prompts/app-registry';
import type {
  BrowserTargetInput,
  DomCandidate,
  StructuredDomSnapshot,
  TargetDescriptor,
} from '@/lib/browser/types';
import type { PublishTraceStep } from '@/lib/jd-publishing/types';
import { CANDIDATE_SCREENING_WORKFLOW_REPAIR_PROMPT_ID } from '../prompts';

const nonEmptyText = z.string().trim().min(1).max(240);

const targetDescriptorSchema = z
  .object({
    kind: z.enum(['field', 'button']),
    role: z.enum(['textbox', 'button', 'combobox']).optional(),
    name: nonEmptyText,
    exact: z.boolean().optional(),
    stableAttrs: z
      .object({
        testId: nonEmptyText.optional(),
        id: nonEmptyText.optional(),
        name: nonEmptyText.optional(),
      })
      .strict()
      .optional(),
    scope: z
      .object({
        kind: z.enum(['form', 'page']),
        name: nonEmptyText.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const workflowRepairOutputSchema = z
  .object({
    target: targetDescriptorSchema,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type CandidateScreeningWorkflowRepairAgentInput = {
  skillId: string;
  workflowVersion: number;
  failedStepId: string;
  targetKey: string;
  failedTarget: BrowserTargetInput;
  error: string;
  structuredSnapshot: StructuredDomSnapshot;
  traceSteps: PublishTraceStep[];
};

export type CandidateScreeningWorkflowRepairAgentResult = {
  target: TargetDescriptor;
  reason: string;
  promptId: string;
  promptVersion: string;
  provider: string;
  model: string;
};

type SnapshotCandidate = {
  candidate: DomCandidate;
  formName?: string;
};

function normalizeText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function candidateNames(candidate: DomCandidate): string[] {
  return [
    candidate.accessibleName,
    candidate.label,
    candidate.placeholder,
    candidate.text,
    candidate.name,
  ]
    .map(normalizeText)
    .filter(Boolean);
}

function matchesName(candidate: DomCandidate, target: TargetDescriptor): boolean {
  const expected = normalizeText(target.name);
  return candidateNames(candidate).some((name) =>
    target.exact ? name === expected : name.includes(expected),
  );
}

function inferredRole(candidate: DomCandidate): string | undefined {
  if (candidate.role) return candidate.role;
  if (candidate.tag === 'textarea' || candidate.tag === 'input') return 'textbox';
  if (candidate.tag === 'select') return 'combobox';
  if (candidate.tag === 'button') return 'button';
  if (candidate.tag === 'a') return 'link';
  if (candidate.tag === 'form') return 'form';
  return undefined;
}

function matchesKind(candidate: DomCandidate, target: TargetDescriptor): boolean {
  const role = inferredRole(candidate);
  if (target.kind === 'field') {
    return candidate.editable || role === 'textbox' || role === 'combobox';
  }
  if (target.kind === 'button') return role === 'button';
  if (target.kind === 'link') return role === 'link';
  return Boolean(candidate.text || candidate.accessibleName);
}

function matchesStableAttrs(candidate: DomCandidate, target: TargetDescriptor): boolean {
  const attrs = target.stableAttrs;
  if (!attrs) return true;
  return (
    (!attrs.testId || attrs.testId === candidate.testId) &&
    (!attrs.id || attrs.id === candidate.id) &&
    (!attrs.name || attrs.name === candidate.name)
  );
}

function snapshotCandidates(snapshot: StructuredDomSnapshot): SnapshotCandidate[] {
  return [
    ...snapshot.forms.flatMap((form) =>
      [...form.fields, ...form.buttons].map((candidate) => ({
        candidate,
        formName: form.name,
      })),
    ),
    ...[...snapshot.headings, ...snapshot.links, ...snapshot.textBlocks].map((candidate) => ({
      candidate,
    })),
  ];
}

export function assertCandidateScreeningRepairTargetGrounded(params: {
  target: TargetDescriptor;
  snapshot: StructuredDomSnapshot;
}): void {
  const grounded = snapshotCandidates(params.snapshot).some(({ candidate, formName }) => {
    if (!candidate.visible || !candidate.enabled) return false;
    if (!matchesKind(candidate, params.target) || !matchesName(candidate, params.target)) {
      return false;
    }
    if (params.target.role && params.target.role !== inferredRole(candidate)) return false;
    if (!matchesStableAttrs(candidate, params.target)) return false;
    if (params.target.scope?.kind === 'form') {
      if (formName === undefined) return false;
      if (
        params.target.scope.name &&
        normalizeText(params.target.scope.name) !== normalizeText(formName)
      ) {
        return false;
      }
    }
    return true;
  });

  if (!grounded) {
    throw new Error('Candidate screening workflow repair target is not grounded in the snapshot');
  }
}

function traceSummary(traceSteps: PublishTraceStep[]) {
  return traceSteps.slice(-12).map((step) => ({
    stepId: step.stepId,
    action: step.action,
    success: step.result.success,
    error: step.result.error,
  }));
}

function truncateText(value: string | undefined, maxLength = 240): string | undefined {
  if (value === undefined) return undefined;
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function compactCandidate(candidate: DomCandidate) {
  return {
    tag: candidate.tag,
    role: candidate.role,
    accessibleName: truncateText(candidate.accessibleName),
    label: truncateText(candidate.label),
    placeholder: truncateText(candidate.placeholder),
    id: truncateText(candidate.id),
    name: truncateText(candidate.name),
    testId: truncateText(candidate.testId),
    text: truncateText(candidate.text),
    visible: candidate.visible,
    enabled: candidate.enabled,
    editable: candidate.editable,
  };
}

function compactSnapshot(snapshot: StructuredDomSnapshot) {
  return {
    url: truncateText(snapshot.url, 500),
    title: truncateText(snapshot.title),
    pageState: snapshot.pageState,
    headings: snapshot.headings.slice(0, 20).map(compactCandidate),
    forms: snapshot.forms.slice(0, 20).map((form) => ({
      name: truncateText(form.name),
      fields: form.fields.slice(0, 40).map(compactCandidate),
      buttons: form.buttons.slice(0, 40).map(compactCandidate),
    })),
    links: snapshot.links.slice(0, 40).map(compactCandidate),
    textBlocks: snapshot.textBlocks.slice(0, 40).map(compactCandidate),
  };
}

export async function runCandidateScreeningWorkflowRepairAgent(
  params: CandidateScreeningWorkflowRepairAgentInput,
): Promise<CandidateScreeningWorkflowRepairAgentResult> {
  const renderedPrompt = await renderManagedPrompt(CANDIDATE_SCREENING_WORKFLOW_REPAIR_PROMPT_ID, {
    payload: JSON.stringify({
      skillId: params.skillId,
      workflowVersion: params.workflowVersion,
      failedStepId: params.failedStepId,
      targetKey: params.targetKey,
      failedTarget: params.failedTarget,
      error: params.error,
      structuredSnapshot: compactSnapshot(params.structuredSnapshot),
      traceSteps: traceSummary(params.traceSteps),
    }),
  });
  const response = await invokeLlmChat({
    operation: CANDIDATE_SCREENING_WORKFLOW_REPAIR_PROMPT_ID,
    prompt: {
      id: renderedPrompt.definition.id,
      version: renderedPrompt.definition.version,
    },
    messages: renderedPrompt.messages,
    temperature: renderedPrompt.options.temperature,
    responseFormat: renderedPrompt.options.responseFormat,
  });
  if (!response.content.trim()) {
    throw new Error('Candidate screening workflow repair agent returned empty content');
  }
  const repaired = workflowRepairOutputSchema.parse(JSON.parse(response.content) as unknown);
  assertCandidateScreeningRepairTargetGrounded({
    target: repaired.target,
    snapshot: params.structuredSnapshot,
  });
  return {
    ...repaired,
    promptId: renderedPrompt.definition.id,
    promptVersion: renderedPrompt.definition.version,
    provider: response.provider,
    model: response.model,
  };
}
