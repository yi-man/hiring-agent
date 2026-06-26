import {
  composeJDJobInput,
  isJDContent,
  isJDStatus,
  isJDTone,
  parseCreateJobDescriptionPayload,
  parseRegenerateJobDescriptionPayload,
  parseUpdateJobDescriptionPayload,
} from '@/lib/jd/api';
import type { JD } from '@/types';

const sampleJd: JD = {
  title: '测试工程师',
  summary: '负责自动化质量门禁',
  responsibilities: ['维护 Playwright 用例'],
  requirements: ['熟悉测试策略'],
  bonus: [],
  highlights: ['质量体系建设'],
};

describe('JD API helpers', () => {
  it('validates tone and status enums', () => {
    expect(isJDTone('tech')).toBe(true);
    expect(isJDTone('casual')).toBe(false);
    expect(isJDStatus('published')).toBe(true);
    expect(isJDStatus('draft')).toBe(false);
  });

  it('validates JD content shape', () => {
    expect(isJDContent(sampleJd)).toBe(true);
    expect(isJDContent({ ...sampleJd, responsibilities: 'not-list' })).toBe(false);
    expect(isJDContent(null)).toBe(false);
  });

  it('parses create payloads and reports specific invalid fields', () => {
    expect(parseCreateJobDescriptionPayload('bad')).toEqual({
      ok: false,
      error: 'invalid JSON body',
    });
    expect(parseCreateJobDescriptionPayload({ position: '测试工程师' })).toEqual({
      ok: false,
      error: 'department is required',
    });
    expect(
      parseCreateJobDescriptionPayload({
        department: '技术部',
        position: '测试工程师',
        positionDescription: '负责自动化质量门禁',
        tone: 'casual',
      }),
    ).toEqual({ ok: false, error: 'tone is invalid' });
    expect(
      parseCreateJobDescriptionPayload({
        department: ' 技术部 ',
        position: ' 测试工程师 ',
        positionDescription: ' 负责自动化质量门禁 ',
      }),
    ).toEqual({
      ok: true,
      value: {
        department: '技术部',
        position: '测试工程师',
        positionDescription: '负责自动化质量门禁',
        tone: 'tech',
      },
    });
  });

  it('parses update payloads with empty and invalid branches', () => {
    expect(parseUpdateJobDescriptionPayload({})).toEqual({
      ok: false,
      error: 'at least one field is required',
    });
    expect(parseUpdateJobDescriptionPayload({ status: 'draft' })).toEqual({
      ok: false,
      error: 'status is invalid',
    });
    expect(parseUpdateJobDescriptionPayload({ content: { title: 'broken' } })).toEqual({
      ok: false,
      error: 'content is invalid',
    });
    expect(parseUpdateJobDescriptionPayload({ position: ' ', tone: 'tech' })).toEqual({
      ok: false,
      error: 'position must not be empty',
    });
    expect(
      parseUpdateJobDescriptionPayload({
        status: 'ready_to_publish',
        content: sampleJd,
      }),
    ).toEqual({
      ok: true,
      value: {
        status: 'ready_to_publish',
        content: sampleJd,
      },
    });
  });

  it('parses regenerate payloads with fallback tone', () => {
    expect(parseRegenerateJobDescriptionPayload(undefined, 'formal')).toEqual({
      ok: true,
      value: { extraInstruction: '', tone: 'formal' },
    });
    expect(parseRegenerateJobDescriptionPayload({ tone: 'casual' }, 'tech')).toEqual({
      ok: false,
      error: 'tone is invalid',
    });
    expect(
      parseRegenerateJobDescriptionPayload(
        { currentJd: sampleJd, extraInstruction: ' 强调 AI 招聘经验 ', tone: 'startup' },
        'tech',
      ),
    ).toEqual({
      ok: true,
      value: { currentJd: sampleJd, extraInstruction: '强调 AI 招聘经验', tone: 'startup' },
    });
  });

  it('composes structured job input for agent retrieval', () => {
    expect(
      composeJDJobInput({
        department: '技术部',
        position: '测试工程师',
        positionDescription: '负责自动化质量门禁',
      }),
    ).toContain('职位：测试工程师');
  });
});
