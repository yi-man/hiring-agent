import { render, screen } from '@testing-library/react';
import { withReturnTarget } from '@/lib/navigation/return-url';
import type { CandidateScreeningRunDto } from '@/lib/candidate-screening/repo';
import { ScreeningRunHistory } from './screening-run-history';

const createdAt = '2026-07-15T08:00:00.000Z';

function makeRun(overrides: Partial<CandidateScreeningRunDto> = {}): CandidateScreeningRunDto {
  return {
    id: 'run-1',
    userId: 'user-1',
    jobDescriptionId: 'jd-1',
    platform: 'boss-like',
    mode: 'execution',
    status: 'success',
    currentStage: 'finalizing',
    skillId: 'screen-v6',
    workflow: { name: 'screen_candidates', version: 6 },
    currentWorkflowStep: null,
    searchPlan: null,
    evaluationSchema: null,
    stats: null,
    errorMessage: null,
    startedAt: createdAt,
    finishedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe('ScreeningRunHistory', () => {
  it('keeps every run visible with its exact workflow and return-aware links', () => {
    const returnTarget = {
      href: '/jd-generator/jd-1?returnTo=%2Fjd-generator&returnLabel=%E8%BF%94%E5%9B%9E%E5%88%97%E8%A1%A8',
      label: '返回 JD',
    };
    const runs = [
      makeRun(),
      makeRun({
        id: 'run-2',
        status: 'failed',
        skillId: 'screen-v5',
        workflow: { name: 'screen_candidates', version: 5 },
        createdAt: '2026-07-14T08:00:00.000Z',
        updatedAt: '2026-07-14T08:01:00.000Z',
      }),
    ];

    render(<ScreeningRunHistory jobDescriptionId="jd-1" returnTarget={returnTarget} runs={runs} />);

    expect(screen.getAllByRole('link', { name: /查看执行日志/ })).toHaveLength(2);
    expect(screen.getByRole('link', { name: /run-1.*查看执行日志/ })).toHaveAttribute(
      'href',
      withReturnTarget('/jd-generator/jd-1/screening-runs/run-1', returnTarget),
    );
    expect(screen.getByRole('link', { name: /screen_candidates.*v6/ })).toHaveAttribute(
      'href',
      withReturnTarget('/workflows/screen-v6', returnTarget),
    );
    expect(screen.getByRole('link', { name: /screen_candidates.*v5/ })).toHaveAttribute(
      'href',
      withReturnTarget('/workflows/screen-v5', returnTarget),
    );
  });

  it('labels legacy runs without inventing a workflow link', () => {
    render(
      <ScreeningRunHistory
        jobDescriptionId="jd-1"
        returnTarget={{ href: '/jd-generator/jd-1', label: '返回 JD' }}
        runs={[makeRun({ skillId: null, workflow: null })]}
      />,
    );

    expect(screen.getByText('未关联 Workflow')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /screen_candidates/ })).not.toBeInTheDocument();
  });
});
