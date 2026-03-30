import type { WorkflowSseEvent } from './types';

export function formatSseData(event: WorkflowSseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
