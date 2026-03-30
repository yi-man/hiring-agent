import type { BrowserSubStep, StepStatus, TaskPlan, TaskStep } from './types';

export type RenderPlanToMarkdownInput = {
  plan: TaskPlan;
  runId: string;
  createdAt: string;
};

function formatBrowserSubStepLine(step: BrowserSubStep): string {
  const paramsJson = JSON.stringify(step.params);
  return `${step.action} → ${paramsJson}`;
}

function renderStepBlock(index: number, step: TaskStep): string {
  const n = index + 1;
  const lines: string[] = [
    `### Step ${n}: ${step.description} [${step.status}]`,
    `- **Step ID:** ${step.id}`,
    `- 类型: ${step.type}`,
    `- 失败策略: ${step.onFailure}`,
  ];
  if (step.browserSubSteps?.length) {
    lines.push('- 浏览器子步骤:');
    for (const sub of step.browserSubSteps) {
      lines.push(`  - ${sub.description}: ${formatBrowserSubStepLine(sub)}`);
    }
  }
  return lines.join('\n');
}

/**
 * Serializes a task plan to markdown for persistence and debugging.
 */
export function renderPlanToMarkdown({
  plan,
  runId,
  createdAt,
}: RenderPlanToMarkdownInput): string {
  const header = [
    `# Workflow Plan: ${plan.goal}`,
    '',
    `**RunId:** ${runId}`,
    `**Created at:** ${createdAt}`,
    '',
    '## Fallback strategy',
    '',
    plan.fallbackStrategy,
    '',
    '## Steps',
    '',
  ].join('\n');

  const stepBlocks = plan.steps.map((step, i) => renderStepBlock(i, step)).join('\n\n');
  return `${header}${stepBlocks}\n`;
}

function findStepSectionStart(markdown: string, stepId: string): number {
  const idMarker = `- **Step ID:** ${stepId}`;
  const idIdx = markdown.indexOf(idMarker);
  if (idIdx !== -1) {
    const before = markdown.slice(0, idIdx);
    const lastStep = before.lastIndexOf('\n### Step ');
    if (lastStep !== -1) return lastStep + 1;
    const firstStep = before.indexOf('### Step ');
    return firstStep !== -1 ? firstStep : idIdx;
  }

  const m = /^step-(\d+)$/i.exec(stepId.trim());
  if (m) {
    const n = m[1];
    const needle = `### Step ${n}:`;
    const idx = markdown.indexOf(needle);
    if (idx !== -1) return idx;
  }

  return -1;
}

function findStepSectionEnd(markdown: string, start: number): number {
  const tail = markdown.slice(start);
  const m = /\n### Step \d+:/.exec(tail);
  if (!m) return markdown.length;
  return start + m.index;
}

/**
 * Replaces the status in the matching step header and optionally appends a result summary line.
 */
export function updateStepInMarkdown(
  markdown: string,
  stepId: string,
  status: StepStatus,
  summary?: string,
): string {
  const start = findStepSectionStart(markdown, stepId);
  if (start === -1) return markdown;

  const end = findStepSectionEnd(markdown, start);
  const section = markdown.slice(start, end);
  const lineStart = section.indexOf('### Step ');
  const lineEnd = section.indexOf('\n', lineStart);
  const firstLine = lineEnd === -1 ? section.slice(lineStart) : section.slice(lineStart, lineEnd);
  const newFirstLine = firstLine.replace(/\[[^\]]+\]/, `[${status}]`);
  const newSection = lineEnd === -1 ? newFirstLine : newFirstLine + section.slice(lineEnd);

  let withSummary = newSection;
  if (summary !== undefined && summary !== '') {
    if (!withSummary.includes('- 结果:')) {
      withSummary = withSummary.replace(/\n?$/, `\n- 结果: ${summary}\n`);
    }
  }

  return markdown.slice(0, start) + withSummary + markdown.slice(end);
}

/**
 * Appends a replan section with reason and the updated plan body at the end of the document.
 */
export function appendReplanToMarkdown(
  markdown: string,
  reason: string,
  newPlan: TaskPlan,
): string {
  const trimmed = markdown.replace(/\s+$/, '');
  const replanBody = renderPlanToMarkdown({
    plan: newPlan,
    runId: 'replan',
    createdAt: new Date().toISOString(),
  });
  return `${trimmed}\n\n---\n\n## Replan\n\n**Reason:** ${reason}\n\n${replanBody}`;
}
