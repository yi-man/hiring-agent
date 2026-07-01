import { classifyCandidateMessage, shouldSuppressAutomatedReply } from './rules';

describe('candidate communication rules', () => {
  it.each([
    ['我把简历发你了，麻烦看一下', 'resume_shared'],
    ['可以的，加我微信 wxid_backend_2026', 'contact_shared'],
    ['薪资范围大概是多少？', 'salary_question'],
    ['这个岗位技术栈和办公地点方便介绍下吗', 'job_question'],
    ['你好，还在招吗？', 'greeting'],
    ['暂时不考虑机会，谢谢', 'not_interested'],
  ] as const)('classifies "%s" as %s', (content, expectedIntent) => {
    expect(classifyCandidateMessage(content).intent).toBe(expectedIntent);
  });

  it('suppresses automated replies after terminal rejected and closed stages', () => {
    expect(shouldSuppressAutomatedReply('rejected')).toBe(true);
    expect(shouldSuppressAutomatedReply('closed')).toBe(true);
    expect(shouldSuppressAutomatedReply('contact_exchanged')).toBe(false);
  });
});
