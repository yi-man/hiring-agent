import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LlmObservabilityPage from '@/app/llm-observability/page';

const replaceMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/llm-observability',
  useSearchParams: () => new URLSearchParams('startDate=2026-03-01&endDate=2026-03-07'),
}));

describe('LlmObservabilityPage', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/llm-stats/overview')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              overview: {
                today: {
                  totalCalls: 10,
                  successCalls: 8,
                  errorCalls: 2,
                  totalTokens: 200,
                  avgLatencyMs: 120,
                  errorRate: 0.2,
                },
                week: {
                  weekStartDate: '2026-03-02',
                  totalCalls: 80,
                  successCalls: 70,
                  errorCalls: 10,
                  totalTokens: 2000,
                  avgLatencyMs: 110,
                  errorRate: 0.125,
                },
                total: {
                  totalCalls: 100,
                  successCalls: 90,
                  errorCalls: 10,
                  totalTokens: 3000,
                  avgLatencyMs: 115,
                  errorRate: 0.1,
                },
              },
            }),
          ),
        );
      }
      if (url.includes('/api/llm-stats/trend')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              points: [
                {
                  bucketStart: '2026-03-01',
                  totalCalls: 10,
                  errorCalls: 1,
                  totalTokens: 100,
                  avgLatencyMs: 100,
                },
              ],
            }),
          ),
        );
      }
      if (url.includes('/api/llm-stats/errors')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              summary: { totalCalls: 100, totalErrors: 10, errorRate: 0.1 },
              distributions: { providers: [], models: [], endpoints: [] },
              topErrorEndpoints: [],
            }),
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            page: 1,
            limit: 20,
            total: 1,
            hasMore: false,
            items: [
              {
                id: 'log-1',
                callId: null,
                traceId: null,
                requestId: null,
                timestamp: '2026-03-07T12:00:00.000Z',
                endpoint: '/api/chat',
                provider: 'openai',
                model: 'gpt-4o-mini',
                latencyMs: 123,
                inputTokens: 10,
                outputTokens: 20,
                totalTokens: 30,
                isError: true,
                errorDomain: 'provider',
                errorCode: 'rate_limited',
                providerStatus: null,
                httpStatus: 429,
                retryCount: 1,
                finalOutcome: 'error',
              },
            ],
          }),
        ),
      );
    }) as jest.Mock;
  });

  it('renders sections and requests data endpoints', async () => {
    render(<LlmObservabilityPage />);

    expect(screen.getByText('LLM Observability')).toBeInTheDocument();

    await waitFor(() => {
      const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.some((url) => url.includes('/api/llm-stats/overview'))).toBe(true);
    });

    expect(await screen.findByText('Provider')).toBeInTheDocument();
    expect(await screen.findByText('Only errors')).toBeInTheDocument();
  });

  it('updates query params when filter changes', async () => {
    render(<LlmObservabilityPage />);
    const providerInput = await screen.findByPlaceholderText('openai');
    fireEvent.change(providerInput, { target: { value: 'anthropic' } });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalled();
      expect(replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0]).toContain(
        'provider=anthropic',
      );
    });
  });
});
