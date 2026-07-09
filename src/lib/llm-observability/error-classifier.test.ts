import { classifyLlmError } from '@/lib/llm-observability/error-classifier';

describe('classifyLlmError', () => {
  it('maps timeout errors to timeout domain', () => {
    const result = classifyLlmError({
      code: 'ETIMEDOUT',
      message: 'request timeout after 30000ms',
    });

    expect(result).toEqual({
      errorDomain: 'timeout',
      errorCode: 'ETIMEDOUT',
      providerStatus: null,
    });
  });

  it('maps rate limit errors to rate_limit domain', () => {
    const result = classifyLlmError({
      status: 429,
      message: 'Rate limit exceeded',
    });

    expect(result).toEqual({
      errorDomain: 'rate_limit',
      errorCode: 'rate_limit',
      providerStatus: '429',
    });
  });

  it('maps auth errors to auth domain', () => {
    const result = classifyLlmError({
      status: 401,
      code: 'invalid_api_key',
      message: 'Incorrect API key provided',
    });

    expect(result).toEqual({
      errorDomain: 'auth',
      errorCode: 'invalid_api_key',
      providerStatus: '401',
    });
  });

  it('maps network failures to transport domain', () => {
    const result = classifyLlmError({
      code: 'ENOTFOUND',
      message: 'Network error while connecting',
    });

    expect(result).toEqual({
      errorDomain: 'transport',
      errorCode: 'ENOTFOUND',
      providerStatus: null,
    });
  });

  it('maps Bun ConnectionRefused errors to transport domain', () => {
    const result = classifyLlmError({
      code: 'ConnectionRefused',
      message: 'Unable to connect. Is the computer able to access the url?',
    });

    expect(result).toEqual({
      errorDomain: 'transport',
      errorCode: 'ConnectionRefused',
      providerStatus: null,
    });
  });
});
