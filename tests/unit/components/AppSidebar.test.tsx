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

  it('highlights resumes without highlighting the JD workspace', () => {
    (usePathname as jest.Mock).mockReturnValue('/resumes');

    render(<AppSidebar />);

    expect(screen.getByRole('link', { name: /简历列表/ })).toHaveClass('text-primary');
    expect(screen.getByRole('link', { name: /JD 工作台/ })).not.toHaveClass('text-primary');
  });
});
