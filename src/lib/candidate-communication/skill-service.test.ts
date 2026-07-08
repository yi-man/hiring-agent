/**
 * @jest-environment node
 */
import { runUnreadCandidateCommunicationSkill } from './skill-service';
import { BossLikeCandidateCommunicationAdapter } from './adapters/boss-like';
import { runCandidateCommunicationSkill } from './skill-runner';
import { createBrowserExecutorFromEnv } from '@/lib/browser/executors/browser-executor-factory';

jest.mock('./adapters/boss-like', () => ({
  BossLikeCandidateCommunicationAdapter: jest.fn(),
}));

jest.mock('./skill-runner', () => ({
  runCandidateCommunicationSkill: jest.fn(),
}));

jest.mock('@/lib/browser/executors/browser-executor-factory', () => ({
  createBrowserExecutorFromEnv: jest.fn(),
}));

const BossLikeCandidateCommunicationAdapterMock =
  BossLikeCandidateCommunicationAdapter as jest.MockedClass<
    typeof BossLikeCandidateCommunicationAdapter
  >;
const runCandidateCommunicationSkillMock = runCandidateCommunicationSkill as jest.MockedFunction<
  typeof runCandidateCommunicationSkill
>;
const createBrowserExecutorFromEnvMock = createBrowserExecutorFromEnv as jest.MockedFunction<
  typeof createBrowserExecutorFromEnv
>;

describe('runUnreadCandidateCommunicationSkill', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      BROWSER_EXECUTOR: 'http-command',
      BROWSER_COMMAND_ENDPOINT: 'http://127.0.0.1:4100/browser-command',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates the communication browser through the shared browser executor factory without hiding adapter env', async () => {
    const executor = { close: jest.fn() };
    const adapter = { platform: 'boss-like' };
    createBrowserExecutorFromEnvMock.mockReturnValueOnce(executor as never);
    BossLikeCandidateCommunicationAdapterMock.mockImplementationOnce(() => adapter as never);
    runCandidateCommunicationSkillMock.mockResolvedValueOnce({
      status: 'success',
      stoppedReason: 'no_unread_messages',
      processed: 0,
      failed: 0,
      passes: 1,
    });

    await runUnreadCandidateCommunicationSkill({
      userId: 'user-1',
      platform: 'boss-like',
      maxPasses: 10,
    });

    expect(createBrowserExecutorFromEnvMock).toHaveBeenCalledWith(
      expect.objectContaining({
        BROWSER_EXECUTOR: 'http-command',
        BROWSER_COMMAND_ENDPOINT: 'http://127.0.0.1:4100/browser-command',
      }),
      { defaultTimeoutMs: 10_000, userId: 'user-1' },
    );
    expect(BossLikeCandidateCommunicationAdapterMock).toHaveBeenCalledWith({ executor });
    expect(runCandidateCommunicationSkillMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter,
        maxPasses: 10,
        platform: 'boss-like',
        userId: 'user-1',
      }),
    );
  });
});
