import {
  parseCompanyProfilePayload,
  parseCompanyRecruitmentPlatformsPayload,
  normalizeCompanyWorkLocations,
} from '@/lib/company-profile/api';

describe('company profile API helpers', () => {
  it('parses a profile payload with trimmed company name and normalized locations', () => {
    const result = parseCompanyProfilePayload({
      name: '  深海数据  ',
      supportedPlatforms: [' liepin ', 'boss', 'liepin'],
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
        supportedPlatforms: ['boss', 'liepin'],
        locations: [
          { kind: 'office', label: '上海张江', city: '上海', address: '博云路 2 号' },
          { kind: 'remote', label: '远程', city: null, address: null },
        ],
      },
    });
  });

  it('uses boss-like for old clients and rejects an explicitly empty platform selection', () => {
    expect(
      parseCompanyProfilePayload({
        name: '深海数据',
        locations: [{ kind: 'remote' }],
      }),
    ).toMatchObject({ ok: true, value: { supportedPlatforms: ['boss-like'] } });
    expect(
      parseCompanyProfilePayload({
        name: '深海数据',
        supportedPlatforms: [],
        locations: [{ kind: 'remote' }],
      }),
    ).toEqual({ ok: false, error: 'at least one recruitment platform is required' });
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

  it('parses position-specific interview processes with ordered round responsibilities', () => {
    expect(
      parseCompanyProfilePayload({
        name: '深海数据',
        locations: [{ kind: 'remote' }],
        interviewProcesses: [
          {
            id: 'engineering',
            positionType: '技术岗位',
            autoMatch: {
              departments: [' 技术部 ', '研发部', '技术部'],
              positionKeywords: [' 前端 ', '后端'],
              isFallback: true,
            },
            stages: [
              { id: 'technical', name: '技术面', purpose: '验证专业能力与问题解决方法' },
              { id: 'manager', name: '主管面', purpose: '确认协作方式与岗位动机' },
            ],
          },
        ],
      }),
    ).toMatchObject({
      ok: true,
      value: {
        interviewProcesses: [
          {
            id: 'engineering',
            positionType: '技术岗位',
            autoMatch: {
              departments: ['技术部', '研发部'],
              positionKeywords: ['前端', '后端'],
              isFallback: true,
            },
            stages: [
              {
                id: 'technical',
                name: '技术面',
                purpose: '验证专业能力与问题解决方法',
                sortOrder: 0,
              },
              {
                id: 'manager',
                name: '主管面',
                purpose: '确认协作方式与岗位动机',
                sortOrder: 1,
              },
            ],
          },
        ],
      },
    });
  });

  it('rejects duplicated position types and interview processes without rounds', () => {
    const base = { name: '深海数据', locations: [{ kind: 'remote' }] };

    expect(
      parseCompanyProfilePayload({
        ...base,
        interviewProcesses: [{ id: 'one', positionType: '技术岗位', stages: [] }],
      }),
    ).toEqual({ ok: false, error: 'each interview process must contain at least one stage' });
    expect(
      parseCompanyProfilePayload({
        ...base,
        interviewProcesses: [
          {
            id: 'one',
            positionType: '技术岗位',
            stages: [{ id: 'one-round', name: '技术面', purpose: '验证专业能力' }],
          },
          {
            id: 'two',
            positionType: '技术岗位',
            stages: [{ id: 'two-round', name: '主管面', purpose: '确认岗位动机' }],
          },
        ],
      }),
    ).toEqual({ ok: false, error: 'interview process position type is duplicated' });

    expect(
      parseCompanyProfilePayload({
        ...base,
        interviewProcesses: [
          {
            id: 'one',
            positionType: '技术岗位',
            autoMatch: { isFallback: true },
            stages: [{ id: 'one-round', name: '技术面', purpose: '验证专业能力' }],
          },
          {
            id: 'two',
            positionType: '行政岗位',
            autoMatch: { isFallback: true },
            stages: [{ id: 'two-round', name: '部门面', purpose: '验证岗位匹配' }],
          },
        ],
      }),
    ).toEqual({ ok: false, error: 'only one fallback interview process is allowed' });
  });

  it('parses connection settings for any available platform', () => {
    expect(
      parseCompanyRecruitmentPlatformsPayload(
        {
          platformConfigs: [
            {
              platformId: 'zhilian',
              baseUrl: ' http://localhost:6183 ',
              username: ' admin ',
              password: 'secret',
              variables: { resumeListPath: ' /employer/resumes ' },
            },
          ],
        },
        ['boss', 'zhilian'],
      ),
    ).toEqual({
      ok: true,
      value: [
        {
          platformId: 'zhilian',
          baseUrl: 'http://localhost:6183',
          username: 'admin',
          password: 'secret',
          variables: { resumeListPath: '/employer/resumes' },
        },
      ],
    });

    expect(parseCompanyRecruitmentPlatformsPayload({ platformConfigs: [] }, ['zhilian'])).toEqual({
      ok: false,
      error: 'at least one recruitment platform configuration is required',
    });
  });
});
