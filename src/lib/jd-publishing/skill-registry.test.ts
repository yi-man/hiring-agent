import { RECRUITMENT_PLATFORM_IDS } from '@/lib/recruitment-platforms';
import { getActivePublishSkill } from './skill-registry';

describe('publish skill registry', () => {
  it('provides an independent active publish skill for every platform', () => {
    const skills = RECRUITMENT_PLATFORM_IDS.map(getActivePublishSkill);
    expect(skills.map((skill) => skill.id)).toEqual([
      'boss-publish-jd',
      'liepin-publish-jd',
      'zhilian-publish-jd',
      'boss-like-publish-jd',
    ]);
    expect(new Set(skills.map((skill) => skill.id)).size).toBe(skills.length);
  });

  it('keeps platform-specific DOM targets', () => {
    const readTitleTarget = (platform: 'boss' | 'liepin' | 'zhilian') => {
      const step = getActivePublishSkill(platform).steps.find((item) => item.id === 'fill_company');
      return step?.type === 'action' ? step.params.target : null;
    };
    expect(readTitleTarget('boss')).toMatchObject({ name: '招聘企业' });
    expect(readTitleTarget('liepin')).toMatchObject({ name: '所属公司' });
    expect(readTitleTarget('zhilian')).toMatchObject({ name: '公司' });
  });
});
