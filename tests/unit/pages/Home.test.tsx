import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home', () => {
  it('应该显示页面标题', () => {
    render(<Home />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toMatch(/招聘全流程/);
  });

  it('应该显示主要操作入口', () => {
    const { container } = render(<Home />);
    expect(container.querySelector('a[href="/chat"]')).toBeTruthy();
    expect(container.querySelector('a[href="/jd-generator"]')).toBeTruthy();
  });

  it('应该显示核心能力区块与能力卡片', () => {
    render(<Home />);
    const coreHeading = screen
      .getAllByRole('heading', { level: 2 })
      .find((el) => (el.textContent ?? '').includes('核心'));
    expect(coreHeading).toBeDefined();
    expect(screen.getByText('智能对话')).toBeInTheDocument();
    expect(screen.getByText('Workflow 学习')).toBeInTheDocument();
    expect(screen.getByText('LLM 可观测')).toBeInTheDocument();
  });

  it('应该显示本地开发提示', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /本地开发/ })).toBeInTheDocument();
    expect(screen.getByText(/pnpm install && pnpm dev/)).toBeInTheDocument();
  });
});
