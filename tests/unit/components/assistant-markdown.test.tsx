import { render, screen } from '@testing-library/react';
import { AssistantMarkdown } from '@/components/chat/message-renderers/assistant-markdown';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => undefined,
}));

describe('AssistantMarkdown', () => {
  it('renders heading list and code block', () => {
    render(
      <AssistantMarkdown>{'## 标题\n\n- 项目A\n\n```ts\nconst n = 1;\n```'}</AssistantMarkdown>,
    );
    const content = screen.getByText(/## 标题/);
    expect(content).toHaveTextContent('项目A');
    expect(content).toHaveTextContent('const n = 1;');
  });
});
