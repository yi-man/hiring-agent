import { buildWorkflowFlow } from './flow';
import type { PublishStep } from '@/lib/jd-publishing/types';

describe('workflow flow helpers', () => {
  it('builds Mermaid-style nodes and edges from action and condition steps', () => {
    const steps: PublishStep[] = [
      {
        id: 'open_new_job',
        type: 'action',
        action: 'navigate',
        params: { url: '{{target.newJobUrl}}' },
        next: 'check_login',
      },
      {
        id: 'check_login',
        type: 'condition',
        check: { type: 'text_contains', text: '职位名称' },
        ifTrue: { next: 'fill_title' },
        ifFalse: { next: 'fill_username' },
      },
      {
        id: 'fill_title',
        type: 'action',
        action: 'fill',
        params: { value: '{{input.title}}' },
        next: 'done',
      },
      {
        id: 'fill_username',
        type: 'action',
        action: 'fill',
        params: { value: '{{credentials.username}}' },
        next: 'done',
      },
      { id: 'done', type: 'end' },
    ];

    const flow = buildWorkflowFlow(steps);

    expect(flow.nodes).toEqual([
      { id: 'open_new_job', label: 'open_new_job', kind: 'action', description: 'navigate' },
      {
        id: 'check_login',
        label: 'check_login',
        kind: 'condition',
        description: 'text_contains',
      },
      { id: 'fill_title', label: 'fill_title', kind: 'action', description: 'fill' },
      { id: 'fill_username', label: 'fill_username', kind: 'action', description: 'fill' },
      { id: 'done', label: 'done', kind: 'end', description: '结束' },
    ]);
    expect(flow.edges).toEqual([
      { from: 'open_new_job', to: 'check_login', label: 'next' },
      { from: 'check_login', to: 'fill_title', label: 'ifTrue' },
      { from: 'check_login', to: 'fill_username', label: 'ifFalse' },
      { from: 'fill_title', to: 'done', label: 'next' },
      { from: 'fill_username', to: 'done', label: 'next' },
    ]);
    expect(flow.mermaid).toContain('flowchart TD');
    expect(flow.mermaid).toContain('open_new_job["open_new_job\\nnavigate"]');
    expect(flow.mermaid).toContain('check_login -- "ifTrue" --> fill_title');
  });

  it('omits unreachable placeholder steps from the rendered flow', () => {
    const steps: PublishStep[] = [
      {
        id: 'start',
        type: 'action',
        action: 'navigate',
        params: {},
        next: 'done',
      },
      { id: 'done', type: 'end' },
      { id: 'failed', type: 'end' },
    ];

    const flow = buildWorkflowFlow(steps);

    expect(flow.nodes.map((node) => node.id)).toEqual(['start', 'done']);
    expect(flow.edges).toEqual([{ from: 'start', to: 'done', label: 'next' }]);
    expect(flow.mermaid).not.toContain('failed');
  });

  it('renders observe steps as browser actions', () => {
    const steps: PublishStep[] = [
      {
        id: 'observe_list',
        type: 'action',
        action: 'observe',
        params: { format: 'html', saveAs: 'listHtml' },
        next: 'done',
      },
      { id: 'done', type: 'end' },
    ];

    expect(buildWorkflowFlow(steps).nodes).toContainEqual(
      expect.objectContaining({ id: 'observe_list', description: 'observe' }),
    );
  });

  it('synthesizes referenced missing targets as terminal nodes', () => {
    const steps: PublishStep[] = [
      {
        id: 'start',
        type: 'action',
        action: 'navigate',
        params: {},
        next: 'failed',
      },
    ];

    const flow = buildWorkflowFlow(steps);

    expect(flow.nodes).toEqual([
      { id: 'start', label: 'start', kind: 'action', description: 'navigate' },
      { id: 'failed', label: 'failed', kind: 'external', description: '外部终止' },
    ]);
    expect(flow.edges).toEqual([{ from: 'start', to: 'failed', label: 'next' }]);
    expect(flow.mermaid).toContain('failed["failed\\n外部终止"]');
  });
});
