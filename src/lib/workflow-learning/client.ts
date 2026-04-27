/**
 * Browser client: POST /api/workflow-learning/chat and return raw SSE body stream.
 */
export async function streamWorkflowLearningMessage(
  message: string,
  options: { sessionId?: string; conversationId?: string } = {},
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch('/api/workflow-learning/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, ...options }),
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
