import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JDGeneratorWorkbench } from '@/components/jd-generator/workbench';

describe('JDGeneratorWorkbench', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          jd: {
            title: '高级前端工程师',
            summary: 'summary',
            responsibilities: ['r1'],
            requirements: ['q1'],
            bonus: [],
            highlights: ['h1'],
          },
          meta: {
            model: 'mock-jd-agent',
            promptVersion: 'jd_v3.2',
            action: 'initial_generate',
            context: {
              used: true,
              query: '高级前端工程师',
              textLength: 42,
              matches: [
                {
                  score: 0.91,
                  documentId: 'doc-1',
                  chunkId: 'chunk-1',
                  chunkIndex: 0,
                  filename: 'company.md',
                  title: '公司介绍',
                  sourceLabel: null,
                },
              ],
              warnings: [],
            },
          },
        },
      }),
    }) as jest.Mock;
  });

  it('generates jd from job input', async () => {
    render(<JDGeneratorWorkbench />);
    fireEvent.change(screen.getByLabelText('要创建什么岗位'), {
      target: { value: '招聘高级前端工程师' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成 JD' }));

    await waitFor(() => {
      expect(screen.getByText('已使用公司上下文')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(/summary/)).toBeInTheDocument();
    expect(screen.getByText(/company.md/)).toBeInTheDocument();
  });
});
