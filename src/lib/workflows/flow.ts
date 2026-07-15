import type { PublishStep } from '@/lib/jd-publishing/types';

export type WorkflowFlowNode = {
  id: string;
  label: string;
  kind: PublishStep['type'] | 'external';
  description: string;
};

export type WorkflowFlowEdge = {
  from: string;
  to: string;
  label: 'next' | 'ifTrue' | 'ifFalse';
};

export type WorkflowFlow = {
  nodes: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
  mermaid: string;
};

const EXTERNAL_TERMINAL_DESCRIPTION = '外部终止';

function describeStep(step: PublishStep): string {
  if (step.type === 'action') {
    return step.action;
  }

  if (step.type === 'condition') {
    return step.check.type;
  }

  return '结束';
}

function collectEdges(step: PublishStep): WorkflowFlowEdge[] {
  if (step.type === 'action') {
    return [{ from: step.id, to: step.next, label: 'next' }];
  }

  if (step.type === 'condition') {
    const edges: WorkflowFlowEdge[] = [];
    if (step.ifTrue) {
      edges.push({ from: step.id, to: step.ifTrue.next, label: 'ifTrue' });
    }
    if (step.ifFalse) {
      edges.push({ from: step.id, to: step.ifFalse.next, label: 'ifFalse' });
    }
    return edges;
  }

  return [];
}

function mapStepNode(step: PublishStep): WorkflowFlowNode {
  return {
    id: step.id,
    label: step.id,
    kind: step.type,
    description: describeStep(step),
  };
}

function collectReachableStepIds(steps: PublishStep[], edges: WorkflowFlowEdge[]): Set<string> {
  const firstStep = steps[0];
  if (!firstStep) {
    return new Set();
  }

  const knownStepIds = new Set(steps.map((step) => step.id));
  const edgesBySource = new Map<string, WorkflowFlowEdge[]>();
  const incomingStepIds = new Set<string>();
  for (const edge of edges) {
    edgesBySource.set(edge.from, [...(edgesBySource.get(edge.from) ?? []), edge]);
    if (knownStepIds.has(edge.to)) incomingStepIds.add(edge.to);
  }

  const reachable = new Set<string>();
  const queue = [
    firstStep.id,
    ...steps
      .filter(
        (step) => step.id !== firstStep.id && step.type !== 'end' && !incomingStepIds.has(step.id),
      )
      .map((step) => step.id),
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reachable.has(current) || !knownStepIds.has(current)) {
      continue;
    }

    reachable.add(current);
    for (const edge of edgesBySource.get(current) ?? []) {
      if (knownStepIds.has(edge.to) && !reachable.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  return reachable;
}

function collectMissingTargetIds(edges: WorkflowFlowEdge[], knownNodeIds: Set<string>): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    if (!knownNodeIds.has(edge.to) && !seen.has(edge.to)) {
      missing.push(edge.to);
      seen.add(edge.to);
    }
  }

  return missing;
}

function mermaidId(rawId: string, index: number): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(rawId) ? rawId : `step_${index}`;
}

function escapeMermaidLabel(label: string): string {
  return label.replace(/"/g, '\\"');
}

function buildMermaid(nodes: WorkflowFlowNode[], edges: WorkflowFlowEdge[]): string {
  const idMap = new Map(nodes.map((node, index) => [node.id, mermaidId(node.id, index)]));
  const lines = ['flowchart TD'];

  for (const node of nodes) {
    const id = idMap.get(node.id) ?? node.id;
    const label = escapeMermaidLabel(`${node.label}\\n${node.description}`);
    lines.push(`  ${id}["${label}"]`);
  }

  for (const edge of edges) {
    const from = idMap.get(edge.from) ?? edge.from;
    const to = idMap.get(edge.to) ?? edge.to;
    lines.push(`  ${from} -- "${edge.label}" --> ${to}`);
  }

  return lines.join('\n');
}

export function buildWorkflowFlow(steps: PublishStep[]): WorkflowFlow {
  const allEdges = steps.flatMap(collectEdges);
  const reachableStepIds = collectReachableStepIds(steps, allEdges);
  const reachableSteps = steps.filter((step) => reachableStepIds.has(step.id));
  const reachableStepIdSet = new Set(reachableSteps.map((step) => step.id));
  const edges = reachableSteps
    .flatMap(collectEdges)
    .filter((edge) => edge.from === steps[0]?.id || reachableStepIdSet.has(edge.from));
  const nodes = reachableSteps.map(mapStepNode);
  const knownNodeIds = new Set(nodes.map((node) => node.id));
  const externalNodes = collectMissingTargetIds(edges, knownNodeIds).map<WorkflowFlowNode>(
    (id) => ({
      id,
      label: id,
      kind: 'external',
      description: EXTERNAL_TERMINAL_DESCRIPTION,
    }),
  );

  return {
    nodes: [...nodes, ...externalNodes],
    edges,
    mermaid: buildMermaid([...nodes, ...externalNodes], edges),
  };
}
