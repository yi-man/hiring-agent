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
      expect(screen.getByDisplayValue(/高级前端工程师/)).toBeInTheDocument();
    });
  });
});
