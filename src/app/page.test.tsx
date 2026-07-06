import { render, screen } from '@testing-library/react';
import Home from './page';
import { getServerAuthSession } from '@/lib/auth/session';

jest.mock('@/lib/auth/session', () => ({
  getServerAuthSession: jest.fn(),
}));

jest.mock('@/components/auth/sign-in-button', () => ({
  SignInButton: () => <a href="/auth/signin">登录</a>,
}));

jest.mock('@/components/dashboard/dashboard-page', () => ({
  DashboardPage: () => <section aria-label="招聘岗位运营台">工作台内容</section>,
}));

const getServerAuthSessionMock = getServerAuthSession as jest.MockedFunction<
  typeof getServerAuthSession
>;

describe('Home page', () => {
  beforeEach(() => {
    getServerAuthSessionMock.mockReset();
  });

  it('renders sign-in guidance when unauthenticated', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce(null);

    render(await Home());

    expect(screen.getByRole('heading', { name: /请先登录后继续/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /登录/i })).toHaveAttribute('href', '/auth/signin');
    expect(screen.queryByText(/招聘全流程/)).not.toBeInTheDocument();
  });

  it('renders dashboard when authenticated', async () => {
    getServerAuthSessionMock.mockResolvedValueOnce({
      user: { id: 'u1', username: 'alice', name: 'Alice', email: null, image: null },
    });

    render(await Home());

    expect(screen.getByRole('region', { name: /招聘岗位运营台/i })).toBeInTheDocument();
  });
});
