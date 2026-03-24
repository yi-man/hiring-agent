import { render, screen } from '@testing-library/react';
import NotFound from './not-found';

describe('NotFound page', () => {
  it('renders 404 status code', () => {
    render(<NotFound />);
    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders page title', () => {
    render(<NotFound />);
    expect(screen.getByText('页面未找到')).toBeInTheDocument();
  });

  it('renders page description', () => {
    render(<NotFound />);
    expect(screen.getByText(/很抱歉，您访问的页面不存在或已被移动/i)).toBeInTheDocument();
  });

  it('renders navigation buttons', () => {
    render(<NotFound />);
    expect(screen.getByRole('link', { name: /返回首页/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /联系我们/i })).toBeInTheDocument();
  });

  it('renders possible causes list', () => {
    render(<NotFound />);
    expect(screen.getByText(/可能的原因/i)).toBeInTheDocument();
    expect(screen.getByText(/页面链接已过期/i)).toBeInTheDocument();
    expect(screen.getByText(/页面已被重命名或删除/i)).toBeInTheDocument();
    expect(screen.getByText(/输入的URL有误/i)).toBeInTheDocument();
    expect(screen.getByText(/该页面可能需要特定权限才能访问/i)).toBeInTheDocument();
  });

  it('renders with correct container classes', () => {
    const { container } = render(<NotFound />);
    expect(container.firstChild).toHaveClass('container');
    expect(container.firstChild).toHaveClass('mx-auto');
  });
});
