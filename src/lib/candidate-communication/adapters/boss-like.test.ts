import { extractBossLikeUnreadMessagesFromHtml } from './boss-like';

describe('boss-like candidate communication adapter', () => {
  it('extracts only unread candidate messages from the inbox html', () => {
    const messages = extractBossLikeUnreadMessagesFromHtml(
      `<!doctype html>
      <main>
        <article data-message-id="msg-1" data-candidate-id="boss-cand-1" data-profile-url="/employer/resumes/boss-cand-1" data-unread="true">
          <h2>Ada Lovelace</h2>
          <p data-field="message">你好，还在招吗？</p>
          <time datetime="2026-06-30T12:00:00.000Z">刚刚</time>
        </article>
        <article data-message-id="msg-2" data-candidate-id="boss-cand-2" data-profile-url="/employer/resumes/boss-cand-2" data-unread="false">
          <h2>Grace Hopper</h2>
          <p data-field="message">已读消息</p>
        </article>
      </main>`,
      'http://127.0.0.1:6183',
    );

    expect(messages).toEqual([
      {
        externalMessageId: 'msg-1',
        platformCandidateId: 'boss-cand-1',
        candidateName: 'Ada Lovelace',
        profileUrl: 'http://127.0.0.1:6183/employer/resumes/boss-cand-1',
        content: '你好，还在招吗？',
        receivedAt: new Date('2026-06-30T12:00:00.000Z'),
      },
    ]);
  });
});
