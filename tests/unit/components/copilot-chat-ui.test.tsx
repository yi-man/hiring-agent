import { fireEvent, render, screen } from '@testing-library/react';
import { CopilotChatUI } from '@/components/chat/copilot-chat-ui';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
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
const fetchConversationMessagesMock = jest.fn();
const fetchConversationDocumentsMock = jest.fn();
const streamPatternRunMock = jest.fn();
const approvePatternRunMock = jest.fn();
const createConversationApiMock = jest.fn();
const uploadConversationDocumentMock = jest.fn();
const deleteConversationDocumentMock = jest.fn();

jest.mock('@/lib/chat/client', () => ({
  fetchConversations: () => fetchConversationsMock(),
  fetchConversationMessages: (...args: unknown[]) => fetchConversationMessagesMock(...args),
  fetchConversationDocuments: (...args: unknown[]) => fetchConversationDocumentsMock(...args),
  streamPatternRun: (...args: unknown[]) => streamPatternRunMock(...args),
  approvePatternRun: (...args: unknown[]) => approvePatternRunMock(...args),
  createConversationApi: (...args: unknown[]) => createConversationApiMock(...args),
  uploadConversationDocument: (...args: unknown[]) => uploadConversationDocumentMock(...args),
  deleteConversationDocument: (...args: unknown[]) => deleteConversationDocumentMock(...args),
}));

function makeSseStream(events: Array<Record<string, unknown>>) {
  let idx = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx >= events.length) {
        controller.close();
        return;
      }
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(events[idx++])}\n\n`));
    },
  });
}

describe('CopilotChatUI', () => {
  beforeEach(() => {
    fetchConversationsMock.mockReset();
    fetchConversationMessagesMock.mockReset();
    fetchConversationDocumentsMock.mockReset();
    streamPatternRunMock.mockReset();
    approvePatternRunMock.mockReset();
    createConversationApiMock.mockReset();
    uploadConversationDocumentMock.mockReset();
    deleteConversationDocumentMock.mockReset();
    fetchConversationDocumentsMock.mockResolvedValue([]);
  });

  it('renders composer and supports markdown assistant rendering', async () => {
    fetchConversationsMock
      .mockResolvedValueOnce({
        conversations: [{ id: 'c1', title: 'one' }],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        conversations: [{ id: 'c1', title: 'one' }],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      });
    fetchConversationMessagesMock.mockResolvedValue([]);
    streamPatternRunMock.mockResolvedValue(
      makeSseStream([
        {
          type: 'run_start',
          runId: 'r1',
          patternId: 'basic_streaming_chat',
          startedAt: new Date().toISOString(),
          seq: 0,
        },
        { type: 'assistant_delta', runId: 'r1', text: '## 标题', seq: 1 },
        { type: 'assistant_final', runId: 'r1', text: '## 标题', seq: 2 },
        { type: 'run_end', runId: 'r1', seq: 3 },
      ]),
    );

    render(<CopilotChatUI />);
    await screen.findByText('one');
    expect(screen.getByPlaceholderText('发消息…')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('发消息…'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect((await screen.findAllByText(/标题/)).length).toBeGreaterThan(0);
  });

  it('shows inline assistant error module when stream request fails', async () => {
    fetchConversationsMock.mockResolvedValue({
      conversations: [{ id: 'c1', title: 'one' }],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    fetchConversationMessagesMock.mockResolvedValue([]);
    streamPatternRunMock.mockResolvedValue(
      makeSseStream([
        {
          type: 'run_start',
          runId: 'r2',
          patternId: 'basic_streaming_chat',
          startedAt: new Date().toISOString(),
          seq: 0,
        },
        { type: 'error', runId: 'r2', message: 'network down', seq: 1 },
      ]),
    );

    render(<CopilotChatUI />);
    await screen.findByText('one');
    fireEvent.change(screen.getByPlaceholderText('发消息…'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('回复中断')).toBeInTheDocument();
    expect((await screen.findAllByText('network down')).length).toBeGreaterThan(0);
  });

  it('uses pattern run stream for non-markdown patterns', async () => {
    fetchConversationsMock.mockResolvedValue({
      conversations: [{ id: 'c1', title: 'one' }],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    fetchConversationMessagesMock.mockResolvedValue([]);
    streamPatternRunMock.mockResolvedValue(
      makeSseStream([
        {
          type: 'run_start',
          runId: 'r1',
          patternId: 'tool_calling',
          startedAt: new Date().toISOString(),
          seq: 0,
        },
        { type: 'assistant_delta', runId: 'r1', text: 'hello ', seq: 1 },
        { type: 'assistant_final', runId: 'r1', text: 'hello', seq: 2 },
        { type: 'run_end', runId: 'r1', seq: 3 },
      ]),
    );

    render(<CopilotChatUI />);
    await screen.findByText('one');
    fireEvent.click(screen.getByRole('button', { name: 'Tool Calling' }));
    fireEvent.change(screen.getByPlaceholderText('发消息…'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(streamPatternRunMock).toHaveBeenCalled();
    expect(await screen.findByText(/hello/)).toBeInTheDocument();
  });

  it('supports rejoin replay in join-rejoin mode', async () => {
    fetchConversationsMock.mockResolvedValue({
      conversations: [{ id: 'c1', title: 'one' }],
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    fetchConversationMessagesMock.mockResolvedValue([]);
    streamPatternRunMock
      .mockResolvedValueOnce(
        makeSseStream([
          {
            type: 'run_start',
            runId: 'r-join',
            patternId: 'agent_trace_stream',
            startedAt: new Date().toISOString(),
            seq: 0,
          },
          { type: 'assistant_final', runId: 'r-join', text: 'first', seq: 1 },
          { type: 'run_end', runId: 'r-join', seq: 2 },
        ]),
      )
      .mockResolvedValueOnce(
        makeSseStream([{ type: 'assistant_final', runId: 'r-join', text: 'replay', seq: 3 }]),
      );

    render(<CopilotChatUI />);
    await screen.findByText('one');
    fireEvent.click(screen.getByRole('button', { name: 'Agent Trace Stream' }));
    fireEvent.change(screen.getByPlaceholderText('发消息…'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await screen.findByRole('button', { name: '断线重连' });
    fireEvent.click(screen.getByRole('button', { name: '断线重连' }));

    expect(streamPatternRunMock).toHaveBeenLastCalledWith(
      'c1',
      expect.objectContaining({ runId: 'r-join', replayOnly: true }),
    );
  });
});
