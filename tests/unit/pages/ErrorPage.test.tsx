import { render, screen } from '@testing-library/react';
import ErrorPage from '@/app/error';

describe('Error Page', () => {
  it('renders error page with basic content', () => {
    const mockError = new Error('测试错误信息');

    render(<ErrorPage error={mockError} reset={() => {}} />);

    expect(screen.getByText('应用程序出错')).toBeInTheDocument();
    expect(screen.getByText('很抱歉，应用程序在处理您的请求时遇到了问题。')).toBeInTheDocument();
    expect(screen.getByText(`错误信息：${mockError.message}`)).toBeInTheDocument();
  });

  it('renders retry button', () => {
    const mockError = new Error('测试错误信息');

    render(<ErrorPage error={mockError} reset={() => {}} />);

    expect(screen.getByRole('button', { name: /重试/i })).toBeInTheDocument();
  });

  it('renders back to home button', () => {
    const mockError = new Error('测试错误信息');

    render(<ErrorPage error={mockError} reset={() => {}} />);

    expect(screen.getByRole('link', { name: /返回首页/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /返回首页/i })).toHaveAttribute('href', '/');
  });
});
