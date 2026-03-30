import type { WorkflowSseEvent } from './types';
import { isWorkflowSseEvent } from './types';

/** Incrementally parse SSE `data:` JSON frames from UTF-8 chunks. */
export class WorkflowSseBuffer {
  private buffer = '';
  private readonly decoder = new TextDecoder();

  /** Append chunk and return any complete events parsed from `data: {...}\\n\\n` frames. */
  push(chunk: Uint8Array): WorkflowSseEvent[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const out: WorkflowSseEvent[] = [];

    // SSE events separated by blank line
    let sep: number;
    while ((sep = this.buffer.indexOf('\n\n')) >= 0) {
      const block = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      for (const line of block.split(/\r?\n/)) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const json = t.slice(5).trim();
        if (!json) continue;
        const parsed: unknown = JSON.parse(json);
        if (isWorkflowSseEvent(parsed)) {
          out.push(parsed);
        }
      }
    }
    return out;
  }
}
