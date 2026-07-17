import {
  parseCandidateCommunicationRunPayload,
  parseCandidateMessagePayload,
  parseUnreadSyncPayload,
} from './api';

describe('candidate communication api payload', () => {
  it.each(['boss', 'liepin', 'zhilian', 'boss-like'])(
    'accepts %s batch communication',
    (platform) => {
      expect(parseCandidateCommunicationRunPayload({ mode: 'batch', platform })).toEqual({
        ok: true,
        value: { mode: 'batch', platform },
      });
    },
  );

  it('parses a valid candidate message payload and defaults executeReply to true', () => {
    const parsed = parseCandidateMessagePayload({
      jobDescriptionId: 'jd-1',
      candidateId: 'candidate-1',
      platform: 'boss-like',
      message: {
        content: '你好，薪资范围是多少？',
        externalMessageId: 'msg-1',
        receivedAt: '2026-06-30T12:00:00.000Z',
      },
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        message: {
          content: '你好，薪资范围是多少？',
          externalMessageId: 'msg-1',
          receivedAt: new Date('2026-06-30T12:00:00.000Z'),
        },
        executeReply: true,
      },
    });
  });

  it('rejects empty message content and invalid receivedAt values', () => {
    expect(
      parseCandidateMessagePayload({
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        message: { content: '  ' },
      }),
    ).toEqual({ ok: false, error: 'message.content is required' });

    expect(
      parseCandidateMessagePayload({
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'boss-like',
        message: { content: 'hello', receivedAt: 'not-a-date' },
      }),
    ).toEqual({ ok: false, error: 'message.receivedAt is invalid' });
  });

  it('rejects unsupported platforms', () => {
    expect(
      parseCandidateMessagePayload({
        jobDescriptionId: 'jd-1',
        candidateId: 'candidate-1',
        platform: 'unknown',
        message: { content: 'hello' },
      }),
    ).toEqual({ ok: false, error: 'platform is invalid' });
  });

  it('parses an unread sync request with bounded max passes', () => {
    expect(
      parseUnreadSyncPayload({
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        maxPasses: 5,
      }),
    ).toEqual({
      ok: true,
      value: {
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        maxPasses: 5,
      },
    });

    expect(
      parseUnreadSyncPayload({
        jobDescriptionId: 'jd-1',
        platform: 'boss-like',
        maxPasses: 0,
      }),
    ).toEqual({ ok: false, error: 'maxPasses must be between 1 and 20' });
  });
});
