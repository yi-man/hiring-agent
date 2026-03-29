import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatUI } from '@/components/chat/chat-ui';

jest.mock('@/components/ui', () => ({
  Button: ({
    children,
    onClick,
    isDisabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    isDisabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={isDisabled}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Input: ({
    value,
    onValueChange,
    placeholder,
    onKeyDown,
    isDisabled,
  }: {
    value: string;
    onValueChange?: (v: string) => void;
    placeholder?: string;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    isDisabled?: boolean;
  }) => (
    <input
      value={value}
      placeholder={placeholder}
      disabled={isDisabled}
      onChange={(e) => onValueChange?.(e.target.value)}
      onKeyDown={onKeyDown}
    />
  ),
}));

const fetchConversationsMock = jest.fn();
const createConversationApiMock = jest.fn();
const fetchConversationMessagesMock = jest.fn();
const streamConversationMessageMock = jest.fn();
const uploadConversationDocumentMock = jest.fn();
const fetchConversationDocumentsMock = jest.fn();
const fetchConversationDocumentDetailMock = jest.fn();
const deleteConversationDocumentMock = jest.fn();

jest.mock('@/lib/chat/client', () => ({
  fetchConversations: () => fetchConversationsMock(),
  createConversationApi: () => createConversationApiMock(),
  fetchConversationMessages: (...args: unknown[]) => fetchConversationMessagesMock(...args),
  streamConversationMessage: (...args: unknown[]) => streamConversationMessageMock(...args),
  uploadConversationDocument: (...args: unknown[]) => uploadConversationDocumentMock(...args),
  fetchConversationDocuments: (...args: unknown[]) => fetchConversationDocumentsMock(...args),
  fetchConversationDocumentDetail: (...args: unknown[]) =>
    fetchConversationDocumentDetailMock(...args),
  deleteConversationDocument: (...args: unknown[]) => deleteConversationDocumentMock(...args),
}));

function makeStream(chunks: string[]) {
  let idx = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(new TextEncoder().encode(chunks[idx++]));
    },
  });
}

describe('ChatUI', () => {
  beforeEach(() => {
    fetchConversationsMock.mockReset();
    createConversationApiMock.mockReset();
    fetchConversationMessagesMock.mockReset();
    streamConversationMessageMock.mockReset();
    uploadConversationDocumentMock.mockReset();
    fetchConversationDocumentsMock.mockReset();
    fetchConversationDocumentDetailMock.mockReset();
    deleteConversationDocumentMock.mockReset();
    fetchConversationDocumentsMock.mockResolvedValue([]);
  });

  it('create/select conversation and load messages', async () => {
    fetchConversationsMock.mockResolvedValue({
      conversations: [{ id: 'c1', title: 'one' }],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    fetchConversationMessagesMock.mockResolvedValue([
      { id: 'm1', role: 'assistant', content: 'hi' },
    ]);
    render(<ChatUI />);
    expect(await screen.findByText('one')).toBeInTheDocument();
    await waitFor(() => expect(fetchConversationMessagesMock).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('hi')).toBeInTheDocument();
  });

  it('streams assistant message incrementally after send', async () => {
    fetchConversationsMock
      .mockResolvedValueOnce({
        conversations: [{ id: 'c1', title: 'one' }],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        conversations: [{ id: 'c2', title: 'other' }],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      });
    fetchConversationMessagesMock.mockResolvedValue([]);
    streamConversationMessageMock.mockResolvedValue(makeStream(['你', '好']));
    render(<ChatUI />);
    await screen.findByText('one');
    const input = screen.getByPlaceholderText('输入你的问题');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(await screen.findByText('你好')).toBeInTheDocument();
    expect(screen.queryByText('先创建一个会话，然后开始聊天。')).not.toBeInTheDocument();
    expect(await screen.findByText('one')).toBeInTheDocument();
  });

  it('keeps active conversation visible after refresh pagination misses it', async () => {
    fetchConversationsMock
      .mockResolvedValueOnce({
        conversations: [{ id: 'c1', title: 'one' }],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        conversations: [{ id: 'c2', title: 'other' }],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      });
    fetchConversationMessagesMock.mockResolvedValue([]);
    streamConversationMessageMock.mockResolvedValue(makeStream(['a']));
    render(<ChatUI />);
    await screen.findByText('one');
    const input = screen.getByPlaceholderText('输入你的问题');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await screen.findByText('hello');
    expect(screen.queryByText('先创建一个会话，然后开始聊天。')).not.toBeInTheDocument();
    expect(await screen.findByText('one')).toBeInTheDocument();
  });

  it('can create new conversation from button', async () => {
    fetchConversationsMock.mockResolvedValue({
      conversations: [],
      total: 0,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    createConversationApiMock.mockResolvedValue({ id: 'c9', title: 'new chat' });
    render(<ChatUI />);
    fireEvent.click(await screen.findByRole('button', { name: '新建会话' }));
    expect(await screen.findByText('new chat')).toBeInTheDocument();
  });

  it('shows markdown upload entry for active conversation and uploads file', async () => {
    fetchConversationsMock.mockResolvedValue({
      conversations: [{ id: 'c1', title: 'one' }],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    fetchConversationMessagesMock.mockResolvedValue([]);
    fetchConversationDocumentsMock.mockResolvedValue([]);
    uploadConversationDocumentMock.mockResolvedValue({
      id: 'd1',
      status: 'processing',
    });

    render(<ChatUI />);
    await screen.findByText('one');

    const uploadInput = await screen.findByLabelText('上传 Markdown');
    const file = new File(['# Hello'], 'notes.md', { type: 'text/markdown' });
    fireEvent.change(uploadInput, { target: { files: [file] } });

    await waitFor(() =>
      expect(uploadConversationDocumentMock).toHaveBeenCalledWith('c1', expect.any(File)),
    );
    expect(await screen.findByText(/上下文文档：/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '移除上传' })).toBeInTheDocument();
  });

  it('removes upload via composer when thread is empty (calls delete API)', async () => {
    fetchConversationsMock.mockResolvedValue({
      conversations: [{ id: 'c1', title: 'one' }],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    fetchConversationMessagesMock.mockResolvedValue([]);
    fetchConversationDocumentsMock.mockResolvedValue([]);
    uploadConversationDocumentMock.mockResolvedValue({
      id: 'd1',
      filename: 'notes.md',
      status: 'ready',
    });
    deleteConversationDocumentMock.mockResolvedValue(undefined);

    render(<ChatUI />);
    await screen.findByText('one');

    const uploadInput = await screen.findByLabelText('上传 Markdown');
    const file = new File(['# Hello'], 'notes.md', { type: 'text/markdown' });
    fireEvent.change(uploadInput, { target: { files: [file] } });

    await waitFor(() => expect(uploadConversationDocumentMock).toHaveBeenCalled());
    await screen.findByText(/上下文文档：/);

    fireEvent.click(screen.getByRole('button', { name: '移除上传' }));
    await waitFor(() => expect(deleteConversationDocumentMock).toHaveBeenCalledWith('c1', 'd1'));
  });

  it('clears document context without delete when thread has messages', async () => {
    fetchConversationsMock.mockResolvedValue({
      conversations: [{ id: 'c1', title: 'one' }],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    fetchConversationMessagesMock.mockResolvedValue([
      { id: 'm1', role: 'user', content: 'hi', documentId: 'd1' },
      { id: 'm2', role: 'assistant', content: 'hello' },
    ]);
    fetchConversationDocumentsMock.mockResolvedValue([
      { id: 'd1', filename: 'notes.md', status: 'ready' },
    ]);
    streamConversationMessageMock.mockResolvedValue(makeStream(['a']));

    render(<ChatUI />);
    await screen.findByText('one');
    await screen.findByText(/上下文文档：notes\.md/);

    fireEvent.click(screen.getByRole('button', { name: '不作为上下文' }));
    expect(deleteConversationDocumentMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText(/上下文文档：notes\.md/)).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: '将 notes.md 作为下文上下文' }));
    expect(await screen.findByText(/上下文文档：notes\.md/)).toBeInTheDocument();
  });

  it('renders document status and supports refresh/delete actions', async () => {
    fetchConversationsMock.mockResolvedValue({
      conversations: [{ id: 'c1', title: 'one' }],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    fetchConversationMessagesMock.mockResolvedValue([]);
    fetchConversationDocumentsMock.mockResolvedValue([
      {
        id: 'd1',
        filename: 'notes.md',
        status: 'processing',
      },
      {
        id: 'd2',
        filename: 'done.md',
        status: 'ready',
      },
      {
        id: 'd3',
        filename: 'bad.md',
        status: 'failed',
      },
    ]);
    deleteConversationDocumentMock.mockResolvedValue(undefined);

    render(<ChatUI />);
    await screen.findByText('one');
    expect(await screen.findByText('notes.md')).toBeInTheDocument();
    expect(screen.getByText('processing')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '刷新文档' }));
    await waitFor(() => expect(fetchConversationDocumentsMock).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: '删除 done.md' }));
    await waitFor(() => expect(deleteConversationDocumentMock).toHaveBeenCalledWith('c1', 'd2'));
  });

  it('keeps polling after transient document refresh failure', async () => {
    jest.useFakeTimers();
    try {
      fetchConversationsMock.mockResolvedValue({
        conversations: [{ id: 'c1', title: 'one' }],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      fetchConversationMessagesMock.mockResolvedValue([]);
      fetchConversationDocumentsMock
        .mockResolvedValueOnce([
          {
            id: 'd1',
            filename: 'notes.md',
            status: 'processing',
          },
        ])
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce([
          {
            id: 'd1',
            filename: 'notes.md',
            status: 'processing',
          },
        ]);

      render(<ChatUI />);
      await screen.findByText('one');
      await screen.findByText('processing');

      await waitFor(() => expect(fetchConversationDocumentsMock).toHaveBeenCalledTimes(1));
      act(() => {
        jest.advanceTimersByTime(2500);
      });
      await waitFor(() => expect(fetchConversationDocumentsMock).toHaveBeenCalledTimes(2));
      act(() => {
        jest.advanceTimersByTime(2500);
      });
      await waitFor(() => expect(fetchConversationDocumentsMock).toHaveBeenCalledTimes(3));
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores stale document response when switching conversations', async () => {
    let releaseC1: ((value: unknown) => void) | null = null;
    const c1Promise = new Promise((resolve) => {
      releaseC1 = resolve;
    });
    fetchConversationsMock.mockResolvedValue({
      conversations: [
        { id: 'c1', title: 'one' },
        { id: 'c2', title: 'two' },
      ],
      total: 2,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    fetchConversationMessagesMock.mockResolvedValue([]);
    fetchConversationDocumentsMock.mockImplementation((conversationId: string) => {
      if (conversationId === 'c1') {
        return c1Promise;
      }
      return Promise.resolve([
        {
          id: 'd2',
          filename: 'two.md',
          status: 'ready',
        },
      ]);
    });

    render(<ChatUI />);
    await screen.findByText('one');
    fireEvent.click(screen.getByRole('button', { name: 'two' }));

    await screen.findByText('two.md');
    expect(screen.queryByText('one.md')).not.toBeInTheDocument();

    releaseC1?.([
      {
        id: 'd1',
        filename: 'one.md',
        status: 'ready',
      },
    ]);

    await waitFor(() => expect(fetchConversationDocumentsMock).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(fetchConversationDocumentsMock).toHaveBeenCalledWith('c2'));
    expect(screen.queryByText('one.md')).not.toBeInTheDocument();
    expect(screen.getByText('two.md')).toBeInTheDocument();
  });

  it('does not rearm timer from stale in-flight poll after conversation switch', async () => {
    jest.useFakeTimers();
    try {
      let resolveInFlightPoll: ((value: unknown) => void) | null = null;
      const inFlightPollPromise = new Promise((resolve) => {
        resolveInFlightPoll = resolve;
      });

      fetchConversationsMock.mockResolvedValue({
        conversations: [
          { id: 'c1', title: 'one' },
          { id: 'c2', title: 'two' },
        ],
        total: 2,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      fetchConversationMessagesMock.mockResolvedValue([]);
      fetchConversationDocumentsMock
        .mockResolvedValueOnce([
          {
            id: 'd1',
            filename: 'one.md',
            status: 'processing',
          },
        ])
        .mockImplementationOnce(() => inFlightPollPromise)
        .mockResolvedValueOnce([
          {
            id: 'd2',
            filename: 'two.md',
            status: 'ready',
          },
        ]);

      render(<ChatUI />);
      await screen.findByText('one');
      await screen.findByText('processing');
      await waitFor(() => expect(fetchConversationDocumentsMock).toHaveBeenCalledTimes(1));

      act(() => {
        jest.advanceTimersByTime(2500);
      });
      await waitFor(() => expect(fetchConversationDocumentsMock).toHaveBeenCalledTimes(2));

      fireEvent.click(screen.getByRole('button', { name: 'two' }));
      await screen.findByText('two.md');
      await waitFor(() => expect(fetchConversationDocumentsMock).toHaveBeenCalledTimes(3));

      await act(async () => {
        resolveInFlightPoll?.([
          {
            id: 'd1',
            filename: 'one.md',
            status: 'processing',
          },
        ]);
        await Promise.resolve();
      });

      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(fetchConversationDocumentsMock).toHaveBeenCalledTimes(3);
      expect(screen.queryByText('one.md')).not.toBeInTheDocument();
      expect(screen.getByText('two.md')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });
});
