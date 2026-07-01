/**
 * @jest-environment node
 */
import { runUnreadCandidateCommunicationSkill } from './skill-service';
import { BossLikeCandidateCommunicationAdapter } from './adapters/boss-like';
import { runCandidateCommunicationSkill } from './skill-runner';
import { PlaywrightBrowserExecutor } from '@/lib/jd-publishing/executors/playwright-executor';

jest.mock('./adapters/boss-like', () => ({
  BossLikeCandidateCommunicationAdapter: jest.fn(),
}));

jest.mock('./skill-runner', () => ({
  runCandidateCommunicationSkill: jest.fn(),
}));

jest.mock('@/lib/jd-publishing/executors/playwright-executor', () => ({
  PlaywrightBrowserExecutor: jest.fn(),
}));

const BossLikeCandidateCommunicationAdapterMock =
  BossLikeCandidateCommunicationAdapter as jest.MockedClass<
    typeof BossLikeCandidateCommunicationAdapter
  >;
const runCandidateCommunicationSkillMock = runCandidateCommunicationSkill as jest.MockedFunction<
  typeof runCandidateCommunicationSkill
>;
const PlaywrightBrowserExecutorMock = PlaywrightBrowserExecutor as jest.MockedClass<
  typeof PlaywrightBrowserExecutor
>;

describe('runUnreadCandidateCommunicationSkill', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates the communication browser without forcing headless mode', async () => {
    const executor = { close: jest.fn() };
    const adapter = { platform: 'boss-like' };
    PlaywrightBrowserExecutorMock.mockImplementationOnce(() => executor as never);
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

    expect(PlaywrightBrowserExecutorMock).toHaveBeenCalledWith({ timeoutMs: 10_000 });
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
