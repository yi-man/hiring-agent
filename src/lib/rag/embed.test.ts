import { embedDocuments } from './embed';

const fetchMock = jest.fn();

describe('embedDocuments batching', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_BASE_URL = 'https://example.com/v1';
    process.env.EMBEDDING_MODEL = 'text-embedding-v3';
    process.env.OPENAI_EMBEDDING_USE_MULTIMODAL = 'false';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('splits standard embedding requests into batches of 10', async () => {
    const texts = Array.from({ length: 23 }, (_, i) => `chunk-${i}`);
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { input: string[] };
      return {
        ok: true,
        json: async () => ({
          data: body.input.map((_, index) => ({ embedding: [index + 0.1] })),
        }),
      };
    });

    const vectors = await embedDocuments(texts);
    expect(vectors).toHaveLength(23);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const batchSizes = fetchMock.mock.calls.map((call) => {
      const body = JSON.parse(String((call[1] as RequestInit).body ?? '{}')) as { input: string[] };
      return body.input.length;
    });
    expect(batchSizes).toEqual([10, 10, 3]);
  });
});
