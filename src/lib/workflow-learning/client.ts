/**
 * Browser client: POST /api/workflow-learning/chat and return raw SSE body stream.
 */
export async function streamWorkflowLearningMessage(
  message: string,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch('/api/workflow-learning/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let err = 'Workflow request failed';
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === 'string' && j.error.trim()) err = j.error;
    } catch {
      if (text.trim()) err = text.trim().slice(0, 500);
    }
    throw new Error(err);
  }
  if (!res.body) {
    throw new Error('Empty response body');
  }
  return res.body;
}

async function parseJsonResponse<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let err = fallback;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === 'string' && j.error.trim()) err = j.error;
    } catch {
      if (text.trim()) err = text.trim().slice(0, 500);
    }
    throw new Error(err);
  }
  return (await res.json()) as T;
}

export async function generateWorkflowJson(goal: string): Promise<{
  goal: string;
  steps: Array<{
    id: string;
    tool: string;
    args: Record<string, unknown>;
    description: string;
    canBatch: boolean;
    successCondition?: string;
  }>;
}> {
  const res = await fetch('/api/workflow-learning/workflows/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal }),
    credentials: 'same-origin',
  });
  return parseJsonResponse(res, 'Generate workflow failed');
}

export async function createWorkflowRecord(input: {
  name: string;
  goal: string;
  steps: Array<{
    id: string;
    tool: string;
    args: Record<string, unknown>;
    description: string;
    canBatch: boolean;
    successCondition?: string;
  }>;
}): Promise<{
  workflow: {
    id: string;
    name: string;
    goal: string;
    version: number;
    steps: Array<{
      id: string;
      tool: string;
      args: Record<string, unknown>;
      description: string;
      canBatch: boolean;
      successCondition?: string;
    }>;
  };
}> {
  const res = await fetch('/api/workflow-learning/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'same-origin',
  });
  return parseJsonResponse(res, 'Create workflow failed');
}

export async function fetchWorkflows(): Promise<{
  workflows: Array<{
    id: string;
    name: string;
    goal: string;
    version: number;
    updatedAt: string;
  }>;
}> {
  const res = await fetch('/api/workflow-learning/workflows', { credentials: 'same-origin' });
  return parseJsonResponse(res, 'Fetch workflows failed');
}

export async function runWorkflow(workflowId: string): Promise<{
  result: {
    runId: string;
    success: boolean;
    recovered: boolean;
    error?: string;
    steps: Array<{
      stepId: string;
      tool: string;
      ok: boolean;
      result?: string;
      error?: string;
      durationMs?: number;
    }>;
  };
}> {
  const res = await fetch(`/api/workflow-learning/workflows/${workflowId}/run`, {
    method: 'POST',
    credentials: 'same-origin',
  });
  return parseJsonResponse(res, 'Run workflow failed');
}
