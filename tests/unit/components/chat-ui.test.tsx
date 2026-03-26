import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

jest.mock('@/lib/chat/client', () => ({
  fetchConversations: () => fetchConversationsMock(),
  createConversationApi: () => createConversationApiMock(),
  fetchConversationMessages: (...args: unknown[]) => fetchConversationMessagesMock(...args),
  streamConversationMessage: (...args: unknown[]) => streamConversationMessageMock(...args),
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
    fetchConversationsMock.mockResolvedValue({
      conversations: [{ id: 'c1', title: 'one' }],
      total: 1,
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
});
