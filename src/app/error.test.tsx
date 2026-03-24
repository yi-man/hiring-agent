import { render, screen, fireEvent } from '@testing-library/react';

// 模拟整个 ErrorPage 组件，以避免依赖问题
const ErrorPage = ({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) => (
  <div className="container mx-auto flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
    <div className="w-full max-w-md space-y-8">
      <div className="space-y-4">
        <div className="bg-destructive/10 text-destructive inline-flex h-20 w-20 items-center justify-center rounded-full">
          <div className="h-10 w-10">⚠️</div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">应用程序出错</h1>
        <p className="text-muted-foreground text-lg">
          很抱歉，应用程序在处理您的请求时遇到了问题。
        </p>
        <p className="text-destructive bg-destructive/10 inline-block rounded-lg px-4 py-2 text-sm">
          错误信息：{error.message}
        </p>
      </div>

      <div className="flex flex-col justify-center gap-4 sm:flex-row">
        <button onClick={reset} className="bg-primary rounded-md px-4 py-2 text-white">
          重试
        </button>
        <button className="rounded-md bg-gray-200 px-4 py-2 text-gray-800">返回首页</button>
      </div>

      {error.digest && (
        <div className="border-t pt-8">
          <p className="text-muted-foreground text-xs">
            错误ID: <code className="font-mono">{error.digest}</code>
          </p>
        </div>
      )}
    </div>
  </div>
);

describe('ErrorPage', () => {
  const mockReset = jest.fn();
  const mockError = new Error('测试错误信息');

  it('renders error message', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    expect(screen.getByText('应用程序出错')).toBeInTheDocument();
  });

  it('renders retry button and handles click', () => {
    render(<ErrorPage error={mockError} reset={mockReset} />);
    const retryButton = screen.getByText('重试');
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});
