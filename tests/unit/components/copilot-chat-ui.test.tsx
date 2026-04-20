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
const streamConversationMessageMock = jest.fn();
const createConversationApiMock = jest.fn();
const uploadConversationDocumentMock = jest.fn();
const deleteConversationDocumentMock = jest.fn();

jest.mock('@/lib/chat/client', () => ({
  fetchConversations: () => fetchConversationsMock(),
  fetchConversationMessages: (...args: unknown[]) => fetchConversationMessagesMock(...args),
  fetchConversationDocuments: (...args: unknown[]) => fetchConversationDocumentsMock(...args),
  streamConversationMessage: (...args: unknown[]) => streamConversationMessageMock(...args),
  createConversationApi: (...args: unknown[]) => createConversationApiMock(...args),
  uploadConversationDocument: (...args: unknown[]) => uploadConversationDocumentMock(...args),
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

describe('CopilotChatUI', () => {
  beforeEach(() => {
    fetchConversationsMock.mockReset();
    fetchConversationMessagesMock.mockReset();
    fetchConversationDocumentsMock.mockReset();
    streamConversationMessageMock.mockReset();
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
    streamConversationMessageMock.mockResolvedValue(makeStream(['## 标题']));

    render(<CopilotChatUI />);
    await screen.findByText('one');
    expect(screen.getByPlaceholderText('发消息…')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('发消息…'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText(/标题/)).toBeInTheDocument();
  });
});
