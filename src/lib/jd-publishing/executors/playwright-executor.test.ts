import { PlaywrightBrowserExecutor, resolveHeadlessOption } from './playwright-executor';
import {
  PlaywrightBrowserExecutor as SharedPlaywrightBrowserExecutor,
  resolveHeadlessOption as resolveSharedHeadlessOption,
} from '@/lib/browser/executors/playwright-executor';

describe('JD publishing Playwright executor compatibility export', () => {
  it('re-exports the shared browser Playwright executor', () => {
    expect(PlaywrightBrowserExecutor).toBe(SharedPlaywrightBrowserExecutor);
    expect(resolveHeadlessOption).toBe(resolveSharedHeadlessOption);
  });
});
