/** @jest-environment node */

import { assertJdEvaluateSample } from './assert';
import type { JdEvaluateGoldenSample } from './dataset';
import type { EvaluationResult } from '@/types';

const sample: JdEvaluateGoldenSample = {
  id: 'test-sample',
  anchor: 'problematic',
  label: '测试',
  jd: {
    title: '前端工程师',
    summary: '负责相关工作',
    responsibilities: ['负责相关工作'],
    requirements: ['良好沟通能力'],
    bonus: [],
    highlights: ['发展空间大'],
  },
  companyContext: null,
  expected: {
    scoreRanges: {
      clarity: [1, 6],
      completeness: [1, 6],
      attractiveness: [1, 6],
      specificity: [1, 5],
    },
    rewriteRequired: true,
    issueMustInclude: ['相关'],
  },
  rationale: 'test',
};

describe('assertJdEvaluateSample', () => {
  it('passes when scores, rewrite flag, and keywords match', () => {
    const evaluation: EvaluationResult = {
      scores: { clarity: 4, completeness: 4, attractiveness: 3, specificity: 2 },
      issues: ['出现“相关工作”空话'],
      evidence: ['summary 含相关'],
      suggestions: ['写具体职责'],
      rewrite_required: true,
    };
    expect(assertJdEvaluateSample(sample, evaluation).ok).toBe(true);
  });

  it('skips rewrite assertion when expected.rewriteRequired is null', () => {
    const soft = {
      ...sample,
      expected: { ...sample.expected, rewriteRequired: null, issueMustInclude: undefined },
    };
    const evaluation: EvaluationResult = {
      scores: { clarity: 4, completeness: 4, attractiveness: 3, specificity: 2 },
      issues: [],
      evidence: [],
      suggestions: [],
      rewrite_required: false,
    };
    expect(assertJdEvaluateSample(soft, evaluation).ok).toBe(true);
  });

  it('fails on out-of-range score and missing keyword', () => {
    const evaluation: EvaluationResult = {
      scores: { clarity: 9, completeness: 4, attractiveness: 3, specificity: 2 },
      issues: ['表达不够具体'],
      evidence: [],
      suggestions: [],
      rewrite_required: false,
    };
    const result = assertJdEvaluateSample(sample, evaluation);
    expect(result.ok).toBe(false);
    expect(result.failures.map((item) => item.field)).toEqual(
      expect.arrayContaining(['scores.clarity', 'rewrite_required', 'issueMustInclude']),
    );
  });
});
