import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { SignInForm } from '@/components/auth/sign-in-form';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const refresh = jest.fn();
const push = jest.fn();
const fetchMock = jest.fn();
const dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');

describe('SignInForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ refresh, push });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('marks credentials as required', () => {
    render(<SignInForm />);

    expect(screen.getByLabelText(/username/i)).toBeRequired();
    expect(screen.getByLabelText(/password/i)).toBeRequired();
  });

  it('submits username and password to local login', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { username: 'xxwade' } }),
    });

    render(<SignInForm />);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'xxwade' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'hiring_2026' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: 'xxwade', password: 'hiring_2026' }),
        }),
      );
    });
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/chat');
      expect(refresh).toHaveBeenCalled();
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'hiring-agent-auth-changed',
        }),
      );
    });
  });

  it('shows an error from invalid credentials', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid username or password' }),
    });

    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'xxwade' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid username/i);
  });
});
