import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JDCreateView, JDDetailView, JDListView } from '@/components/jd-generator/jd-pages';
import type { JobDescriptionDto } from '@/types';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: jest.fn(),
  }),
}));

const sampleJobDescription: JobDescriptionDto = {
  id: 'jd-1',
  userId: 'u1',
  department: '技术部',
  position: '前端工程师',
  positionDescription: '负责增长业务体验建设',
  tone: 'tech',
  status: 'created',
  content: {
    title: '前端工程师',
    summary: '负责增长业务体验建设',
    responsibilities: ['建设核心页面'],
    requirements: ['熟悉 TypeScript'],
    bonus: [],
    highlights: ['业务上下文清晰'],
  },
  evaluation: null,
  generationMeta: {
    model: 'mock-jd-agent',
    promptVersion: 'jd_v3.2',
    action: 'initial_generate',
    context: {
      used: true,
      query: '前端工程师',
      textLength: 10,
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
  createdAt: '2026-06-25T01:00:00.000Z',
  updatedAt: '2026-06-25T02:00:00.000Z',
};

describe('JD pages', () => {
  beforeEach(() => {
    pushMock.mockReset();
    global.fetch = jest.fn();
  });

  it('renders the JD list with status and detail link', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobDescriptions: [sampleJobDescription],
        total: 1,
      }),
    });

    render(<JDListView />);

    expect(await screen.findAllByText('前端工程师')).toHaveLength(2);
    expect(screen.getByText('created')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建 JD' })).toHaveAttribute(
      'href',
      '/jd-generator/new',
    );
    expect(screen.getByRole('button', { name: '查看' })).toHaveAttribute(
      'href',
      '/jd-generator/jd-1',
    );
  });

  it('creates a JD from selected department and position', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jobDescription: sampleJobDescription,
      }),
    });

    render(<JDCreateView />);

    fireEvent.change(screen.getByLabelText('部门'), { target: { value: '技术部' } });
    fireEvent.change(screen.getByLabelText('职位'), { target: { value: '前端工程师' } });
    fireEvent.change(screen.getByLabelText('职位说明'), {
      target: { value: '负责增长业务体验建设' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成并创建' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            department: '技术部',
            position: '前端工程师',
            positionDescription: '负责增长业务体验建设',
            tone: 'tech',
          }),
        }),
      );
    });
    expect(pushMock).toHaveBeenCalledWith('/jd-generator/jd-1');
  });

  it('edits, saves and regenerates a JD detail', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobDescription: sampleJobDescription }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tasks: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobDescription: {
            ...sampleJobDescription,
            content: { ...sampleJobDescription.content, summary: '手动调整后的 JD' },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobDescription: sampleJobDescription }),
      });

    render(<JDDetailView jobDescriptionId="jd-1" />);

    const summary = await screen.findByLabelText('岗位摘要');
    fireEvent.change(summary, { target: { value: '手动调整后的 JD' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('手动调整后的 JD'),
        }),
      );
    });

    fireEvent.change(screen.getByLabelText('追加要求'), {
      target: { value: '强调 AI 招聘经验' },
    });
    fireEvent.click(screen.getByRole('button', { name: '重新生成' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/jd/jd-1/regenerate',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            currentJd: { ...sampleJobDescription.content, summary: '手动调整后的 JD' },
            extraInstruction: '强调 AI 招聘经验',
          }),
        }),
      );
    });
    expect(screen.getByText('company.md')).toBeInTheDocument();
  });
});
