import { after } from 'next/server';

/**
 * Schedule fire-and-forget background work triggered from a route handler.
 *
 * Prefers Next.js `after()` so the task is tied to the request lifecycle and
 * still runs once the response is flushed (also safe under serverless where a
 * bare floating promise could be frozen). When called outside of a request
 * scope (e.g. unit tests) `after()` throws, so we fall back to invoking the
 * task synchronously, preserving the original fire-and-forget semantics.
 */
export function scheduleBackgroundTask(
  task: () => Promise<unknown>,
  onError?: (error: unknown) => void,
): void {
  const execute = () => {
    void task().catch((error) => {
      if (onError) {
        onError(error);
      } else {
        console.error('background task failed', error);
      }
    });
  };

  try {
    after(execute);
  } catch {
    execute();
  }
}
