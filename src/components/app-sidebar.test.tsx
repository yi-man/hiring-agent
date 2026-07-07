import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

describe('AppSidebar', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/jd-generator/new');
  });

  it('renders a management-style feature menu outside the header', () => {
    render(<AppSidebar />);

    const menu = screen.getByRole('navigation', { name: '功能菜单' });
    expect(menu).toBeInTheDocument();
    expect(menu.closest('aside')).toHaveClass('lg:w-64');
    expect(menu.closest('aside')).toHaveClass('lg:border-r');

    expect(screen.getByRole('link', { name: /^工作台(?:\s|$)/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /智能对话/i })).toHaveAttribute('href', '/chat');
    expect(screen.getByRole('link', { name: /知识库/i })).toHaveAttribute('href', '/knowledge');
    expect(screen.getByRole('link', { name: /JD 工作台/i })).toHaveAttribute(
      'href',
      '/jd-generator',
    );
    expect(screen.getByRole('link', { name: /Workflow 学习/i })).toHaveAttribute(
      'href',
      '/workflow-learning',
    );
    expect(screen.getByRole('link', { name: /Workflow 库/i })).toHaveAttribute(
      'href',
      '/workflows',
    );
    expect(screen.getByRole('link', { name: /LLM 可观测/i })).toHaveAttribute(
      'href',
      '/llm-observability',
    );
    expect(screen.getByRole('link', { name: /公司设置/i })).toHaveAttribute(
      'href',
      '/settings/company',
    );
  });

  it('highlights the active route branch', () => {
    render(<AppSidebar />);

    expect(screen.getByRole('link', { name: /JD 工作台/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /智能对话/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /简历列表/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /候选人列表/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /面试记录/i })).not.toHaveAttribute('aria-current');
  });

  it('highlights the dashboard route', () => {
    (usePathname as jest.Mock).mockReturnValue('/');

    render(<AppSidebar />);

    expect(screen.getByRole('link', { name: /^工作台(?:\s|$)/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
