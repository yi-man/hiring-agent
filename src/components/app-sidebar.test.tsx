import { fireEvent, render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

describe('AppSidebar', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/jd-generator/new');
  });

  it('renders the main navigation without a redundant feature-menu heading', () => {
    render(<AppSidebar />);

    const menu = screen.getByRole('navigation', { name: '主导航' });
    expect(menu).toBeInTheDocument();
    expect(menu.closest('aside')).toHaveClass('lg:w-64');
    expect(menu.closest('aside')).toHaveClass('lg:border-r');
    expect(screen.queryByText('功能菜单')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /^工作台(?:\s|$)/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /招聘统计/i })).toHaveAttribute(
      'href',
      '/recruitment-stats',
    );
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
    expect(screen.getByRole('link', { name: /Workflow 列表/i })).toHaveAttribute(
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
    expect(screen.queryByRole('link', { name: /招聘平台/i })).not.toBeInTheDocument();

    const menuText = menu.textContent ?? '';

    const operationsSectionIndex = menuText.indexOf('招聘运营');
    const recruitingSectionIndex = menuText.indexOf('招聘流程');
    const automationSectionIndex = menuText.indexOf('知识与自动化');
    const systemSectionIndex = menuText.indexOf('系统');
    expect(operationsSectionIndex).toBeGreaterThan(-1);
    expect(recruitingSectionIndex).toBeGreaterThan(operationsSectionIndex);
    expect(recruitingSectionIndex).toBeGreaterThan(-1);
    expect(automationSectionIndex).toBeGreaterThan(recruitingSectionIndex);
    expect(systemSectionIndex).toBeGreaterThan(automationSectionIndex);

    expect(menuText.indexOf('工作台')).toBeGreaterThan(operationsSectionIndex);
    expect(menuText.indexOf('招聘统计')).toBeGreaterThan(menuText.indexOf('工作台'));
    expect(menuText.indexOf('招聘统计')).toBeLessThan(recruitingSectionIndex);

    expect(menuText.indexOf('JD 工作台')).toBeGreaterThan(recruitingSectionIndex);
    expect(menuText.indexOf('候选人列表')).toBeLessThan(menuText.indexOf('面试记录'));
    expect(menuText.indexOf('面试记录')).toBeLessThan(menuText.indexOf('Workflow 列表'));
    expect(menuText.indexOf('Workflow 列表')).toBeGreaterThan(recruitingSectionIndex);
    expect(menuText.indexOf('Workflow 列表')).toBeLessThan(automationSectionIndex);
    expect(menuText.indexOf('简历列表')).toBeGreaterThan(menuText.indexOf('Workflow 列表'));
    expect(menuText.indexOf('简历列表')).toBeLessThan(automationSectionIndex);

    expect(menuText.indexOf('智能对话')).toBeGreaterThan(automationSectionIndex);
    expect(menuText.indexOf('Workflow 学习')).toBeGreaterThan(automationSectionIndex);
    expect(menuText.indexOf('Workflow 学习')).toBeLessThan(systemSectionIndex);

    expect(menuText.indexOf('LLM 可观测')).toBeGreaterThan(systemSectionIndex);
  });

  it('keeps the complete feature menu reachable at mobile and desktop breakpoints', () => {
    render(<AppSidebar />);

    const toggle = screen.getByRole('button', { name: '展开主导航' });
    const menu = screen.getByRole('navigation', { name: '主导航' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveClass('hidden');
    expect(menu).toHaveClass('lg:flex');
    expect(menu).toHaveClass('lg:overflow-y-auto');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('收起主导航');
    expect(menu).toHaveClass('flex');
    expect(menu).not.toHaveClass('hidden');
    expect(screen.getByRole('link', { name: /公司设置/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /招聘平台/i })).not.toBeInTheDocument();
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

  it('highlights recruitment stats without marking the dashboard', () => {
    (usePathname as jest.Mock).mockReturnValue('/recruitment-stats');

    render(<AppSidebar />);

    expect(screen.getByRole('link', { name: /招聘统计/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /^工作台(?:\s|$)/i })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('highlights company settings for nested settings pages', () => {
    (usePathname as jest.Mock).mockReturnValue('/settings/company/recruitment-platforms');

    render(<AppSidebar />);

    expect(screen.getByRole('link', { name: /公司设置/i })).toHaveAttribute('aria-current', 'page');
  });
});
