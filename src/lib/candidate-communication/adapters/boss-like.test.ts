import {
  extractBossLikeUnreadMessagesFromApi,
  extractBossLikeUnreadMessagesFromHtml,
} from './boss-like';

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

  it('extracts unread messages from the real boss-like conversations API shape', () => {
    const messages = extractBossLikeUnreadMessagesFromApi(
      {
        conversations: [
          {
            userId: 204,
            username: 'xxwade',
            jobId: 59,
            jobTitle: '游戏开发工程师',
            company: '米哈游',
            unreadCount: 1,
            messages: [
              {
                id: 38,
                content: 'hi，看了职位介绍，对这个职位很感兴趣，期望有机会交流。',
                type: 'text',
                isRead: false,
                senderId: 204,
                receiverId: 203,
                createdAt: '2026-06-25T01:48:06.939Z',
              },
            ],
          },
          {
            userId: 204,
            username: 'xxwade',
            jobId: 60,
            jobTitle: '产品经理',
            company: '小红书',
            unreadCount: 0,
            messages: [
              {
                id: 39,
                content: '[Resume] Wade Resume',
                type: 'pdf',
                isRead: true,
                senderId: 204,
                receiverId: 203,
                createdAt: '2026-06-25T01:48:43.038Z',
              },
            ],
          },
        ],
        resumes: [
          {
            id: 201,
            userId: 204,
            name: 'Wade',
            education: '本科',
            experience: '5 年游戏开发',
            projects: 'Unity 商业化项目',
            skills: ['Unity', 'TypeScript'],
            summary: '对游戏工具链和 AI 产品感兴趣',
            user: { username: 'xxwade' },
          },
        ],
        employerUserId: 203,
      },
      'http://localhost:6183',
    );

    expect(messages).toEqual([
      {
        externalMessageId: 'boss-like-message:38',
        platformCandidateId: '201',
        candidateName: 'Wade',
        profileUrl: 'http://localhost:6183/employer/resumes/201',
        content: 'hi，看了职位介绍，对这个职位很感兴趣，期望有机会交流。',
        receivedAt: new Date('2026-06-25T01:48:06.939Z'),
        platformJobTitle: '游戏开发工程师',
        replyTarget: {
          receiverId: '204',
          jobId: '59',
          sourceMessageId: '38',
        },
      },
    ]);
  });
});
