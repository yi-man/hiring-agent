import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  BrainCircuit: () => <svg aria-hidden="true" />,
  Building2: () => <svg aria-hidden="true" />,
  ClipboardList: () => <svg aria-hidden="true" />,
  Eye: () => <svg aria-hidden="true" />,
  FileCode: () => <svg aria-hidden="true" />,
  FileText: () => <svg aria-hidden="true" />,
  GitBranch: () => <svg aria-hidden="true" />,
  LayoutDashboard: () => <svg aria-hidden="true" />,
  MessageCircle: () => <svg aria-hidden="true" />,
  Users: () => <svg aria-hidden="true" />,
}));

describe('AppSidebar', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/');
  });

  it('renders recruiting resource links', () => {
    render(<AppSidebar />);

    expect(screen.getByRole('link', { name: /候选人列表/ })).toHaveAttribute('href', '/candidates');
    expect(screen.getByRole('link', { name: /简历列表/ })).toHaveAttribute('href', '/resumes');
    expect(screen.getByRole('link', { name: /面试记录/ })).toHaveAttribute('href', '/interviews');
  });

  it('marks resumes as current without marking the JD workspace', () => {
    (usePathname as jest.Mock).mockReturnValue('/resumes');

    render(<AppSidebar />);

    expect(screen.getByRole('link', { name: /简历列表/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /JD 工作台/ })).not.toHaveAttribute('aria-current');
  });

  it('marks the JD workspace branch as current without marking recruiting resources', () => {
    (usePathname as jest.Mock).mockReturnValue('/jd-generator/new');

    render(<AppSidebar />);

    expect(screen.getByRole('link', { name: /JD 工作台/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /简历列表/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /候选人列表/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /面试记录/ })).not.toHaveAttribute('aria-current');
  });
});
