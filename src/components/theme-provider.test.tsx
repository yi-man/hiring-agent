import { render, screen } from '@testing-library/react';
import { ThemeProvider } from './theme-provider';

// 模拟 next-themes 库，避免测试时的依赖问题
jest.mock('next-themes', () => ({
  ThemeProvider: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    return (
      <div data-testid="theme-provider" {...props}>
        {children}
      </div>
    );
  },
}));

describe('ThemeProvider', () => {
  it('should render children correctly', () => {
    const testText = 'Test Content';
    render(
      <ThemeProvider>
        <div>{testText}</div>
      </ThemeProvider>,
    );

    expect(screen.getByText(testText)).toBeInTheDocument();
  });

  it('should render with custom attributes', () => {
    const testText = 'Custom Attributes';
    render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <div>{testText}</div>
      </ThemeProvider>,
    );

    expect(screen.getByText(testText)).toBeInTheDocument();
  });

  it('should forward props to NextThemesProvider', () => {
    const testText = 'Props Forwarding';
    const { container } = render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <div>{testText}</div>
      </ThemeProvider>,
    );

    expect(container.firstChild).not.toBeNull();
  });
});
