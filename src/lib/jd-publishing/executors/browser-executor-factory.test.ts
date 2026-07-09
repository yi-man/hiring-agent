import { createBrowserExecutorFromEnv } from './browser-executor-factory';
import { createBrowserExecutorFromEnv as createSharedBrowserExecutorFromEnv } from '@/lib/browser/executors/browser-executor-factory';

describe('JD publishing browser executor factory compatibility export', () => {
  it('re-exports the shared browser executor factory', () => {
    expect(createBrowserExecutorFromEnv).toBe(createSharedBrowserExecutorFromEnv);
  });
});
