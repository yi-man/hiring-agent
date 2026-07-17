import { RECRUITMENT_PLATFORM_IDS } from '@/lib/recruitment-platforms';
import { candidateCommunicationSkills } from './skill-types';

describe('candidate communication skill registry', () => {
  it('keeps one unread-message skill per platform', () => {
    const skills = RECRUITMENT_PLATFORM_IDS.map(
      (platform) => candidateCommunicationSkills[platform],
    );
    expect(skills.map((skill) => skill.id)).toEqual([
      'boss-unread-communication',
      'liepin-unread-communication',
      'zhilian-unread-communication',
      'boss-like-unread-communication',
    ]);
    expect(new Set(skills.map((skill) => skill.id)).size).toBe(skills.length);
    expect(new Set(skills.map((skill) => skill.targets.replyInput)).size).toBe(skills.length);
  });
});
