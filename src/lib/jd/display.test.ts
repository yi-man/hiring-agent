import { getJobDescriptionDisplayTitle } from './display';

describe('getJobDescriptionDisplayTitle', () => {
  it('prefers the JD content title over the position enum', () => {
    expect(
      getJobDescriptionDisplayTitle({
        position: '前端工程师',
        content: { title: '汽水音乐-前端工程师' },
      }),
    ).toBe('汽水音乐-前端工程师');
  });

  it('falls back to position when title is blank', () => {
    expect(
      getJobDescriptionDisplayTitle({
        position: '前端工程师',
        content: { title: '   ' },
      }),
    ).toBe('前端工程师');
  });

  it('falls back to position when content title is missing', () => {
    expect(
      getJobDescriptionDisplayTitle({
        position: '后端工程师',
        content: {},
      }),
    ).toBe('后端工程师');
  });
});
