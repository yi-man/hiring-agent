/**
 * @jest-environment node
 */
import { POST } from '@/app/api/jd/agent/route';

describe('POST /api/jd/agent', () => {
  it('returns 400 when action is missing', async () => {
    const request = new Request('http://localhost/api/jd/agent', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns success payload for initial_generate', async () => {
    const request = new Request('http://localhost/api/jd/agent', {
      method: 'POST',
      body: JSON.stringify({ action: 'initial_generate', jobInput: '高级前端工程师' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    const data = (await response.json()) as { success: boolean };
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
