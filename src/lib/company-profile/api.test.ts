import {
  parseCompanyProfilePayload,
  normalizeCompanyWorkLocations,
} from '@/lib/company-profile/api';

describe('company profile API helpers', () => {
  it('parses a profile payload with trimmed company name and normalized locations', () => {
    const result = parseCompanyProfilePayload({
      name: '  深海数据  ',
      locations: [
        { kind: 'office', label: ' 上海张江 ', city: ' 上海 ', address: ' 博云路 2 号 ' },
        { kind: 'remote', label: ' anywhere ', city: 'ignore', address: 'ignore' },
        { kind: 'office', label: '上海张江', city: '上海', address: '重复会被忽略' },
      ],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        name: '深海数据',
        locations: [
          { kind: 'office', label: '上海张江', city: '上海', address: '博云路 2 号' },
          { kind: 'remote', label: '远程', city: null, address: null },
        ],
      },
    });
  });

  it('rejects missing names and empty location lists', () => {
    expect(parseCompanyProfilePayload({ name: '', locations: [{ kind: 'remote' }] })).toEqual({
      ok: false,
      error: 'company name is required',
    });
    expect(parseCompanyProfilePayload({ name: '深海数据', locations: [] })).toEqual({
      ok: false,
      error: 'at least one work location is required',
    });
  });

  it('assigns sort order after deduplicating locations', () => {
    expect(
      normalizeCompanyWorkLocations([
        { kind: 'remote', label: '远程', city: null, address: null },
        { kind: 'office', label: '深圳南山', city: '深圳', address: '' },
      ]),
    ).toEqual([
      { kind: 'remote', label: '远程', city: null, address: null, sortOrder: 0 },
      { kind: 'office', label: '深圳南山', city: '深圳', address: null, sortOrder: 1 },
    ]);
  });
});
