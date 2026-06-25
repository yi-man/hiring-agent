import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KnowledgePage } from '@/components/knowledge/knowledge-page';

jest.mock('lucide-react', () => ({
  Eye: jest.fn(() => <span data-testid="eye-icon" />),
  FileText: jest.fn(() => <span data-testid="file-text-icon" />),
  RefreshCw: jest.fn(() => <span data-testid="refresh-icon" />),
  Trash2: jest.fn(() => <span data-testid="trash-icon" />),
  Upload: jest.fn(() => <span data-testid="upload-icon" />),
  X: jest.fn(() => <span data-testid="x-icon" />),
}));

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => (
    <div>
      {children
        .split('\n')
        .map((line, index) => {
          if (!line.trim()) return null;
          if (line.startsWith('# ')) return <h1 key={index}>{line.slice(2)}</h1>;
          if (line.startsWith('## ')) return <h2 key={index}>{line.slice(3)}</h2>;
          return <p key={index}>{line}</p>;
        })
        .filter(Boolean)}
    </div>
  ),
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => undefined,
}));

jest.mock('@/components/ui', () => ({
  Button: ({
    children,
    onClick,
    isDisabled,
    type = 'button',
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    isDisabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }) => (
    <button type={type} onClick={onClick} disabled={isDisabled} {...props}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Chip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const fetchMock = jest.fn();

const handbookDocument = {
  id: 'doc-1',
  userId: 'user-1',
  filename: 'handbook.md',
  title: 'Handbook',
  sourceLabel: 'synthetic',
  contentMarkdown: '# Handbook\n\nRecruiting notes',
  status: 'ready',
  errorMessage: null,
  version: 2,
  createdAt: '2026-06-24T10:00:00.000Z',
  updatedAt: '2026-06-25T10:00:00.000Z',
};

describe('KnowledgePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('loads and displays a knowledge document', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ documents: [handbookDocument], total: 1 }),
    });

    render(<KnowledgePage />);

    expect(screen.getAllByText('正在加载知识文档…').length).toBeGreaterThan(0);
    expect(await screen.findByText('handbook.md')).toBeInTheDocument();
    expect(screen.getByText('synthetic')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
  });

  it('previews the selected markdown document', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ documents: [handbookDocument], total: 1 }),
    });

    render(<KnowledgePage />);

    fireEvent.click(await screen.findByRole('button', { name: '预览 handbook.md' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Markdown 预览' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Handbook' })).toBeInTheDocument();
    expect(screen.getByText('Recruiting notes')).toBeInTheDocument();
  });

  it('uploads a markdown file then reloads the document list', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [], total: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ document: handbookDocument }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [handbookDocument], total: 1 }),
      });

    render(<KnowledgePage />);

    const uploadInput = await screen.findByLabelText('上传知识文档');
    const file = new File(['# Handbook'], 'handbook.md', { type: 'text/markdown' });
    fireEvent.change(uploadInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/knowledge/documents',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );
    });
    expect(await screen.findByText('handbook.md')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('refreshes the document list when the refresh button is clicked', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [], total: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [handbookDocument], total: 1 }),
      });

    render(<KnowledgePage />);

    expect(await screen.findByText('还没有知识文档')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/knowledge/documents');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/knowledge/documents');
    expect(await screen.findByText('handbook.md')).toBeInTheDocument();
  });

  it('deletes a document then reloads the document list', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [handbookDocument], total: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deleted: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [], total: 0 }),
      });

    render(<KnowledgePage />);

    fireEvent.click(await screen.findByRole('button', { name: '删除 handbook.md' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/documents/doc-1', {
        method: 'DELETE',
      });
    });
    expect(await screen.findByText('还没有知识文档')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
