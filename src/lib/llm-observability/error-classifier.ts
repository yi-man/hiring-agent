import { ClassifiedLlmError } from '@/lib/llm-observability/types';

type ErrorLike = {
  code?: string | number;
  status?: number;
  statusCode?: number;
  name?: string;
  message?: string;
  type?: string;
};

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === 'object') {
    return error as ErrorLike;
  }

  return {
    message: typeof error === 'string' ? error : String(error),
  };
}

function providerStatusFrom(error: ErrorLike): string | null {
  const status = error.status ?? error.statusCode;
  return typeof status === 'number' ? String(status) : null;
}

export function classifyLlmError(error: unknown): ClassifiedLlmError {
  const errorLike = asErrorLike(error);
  const status = errorLike.status ?? errorLike.statusCode;
  const rawCode = typeof errorLike.code === 'number' ? String(errorLike.code) : errorLike.code;
  const message = (errorLike.message ?? '').toLowerCase();
  const name = (errorLike.name ?? '').toLowerCase();
  const type = (errorLike.type ?? '').toLowerCase();
  const code = (rawCode ?? '').toLowerCase();
  const providerStatus = providerStatusFrom(errorLike);

  const timeoutByText =
    code === 'etimedout' ||
    message.includes('timeout') ||
    name.includes('timeout') ||
    name === 'aborterror';
  if (timeoutByText) {
    return { errorDomain: 'timeout', errorCode: rawCode ?? 'timeout', providerStatus };
  }

  if (
    status === 429 ||
    code === 'rate_limit' ||
    code === 'rate_limit_exceeded' ||
    message.includes('rate limit')
  ) {
    return {
      errorDomain: 'rate_limit',
      errorCode: rawCode ?? 'rate_limit',
      providerStatus: providerStatus ?? '429',
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    code === 'invalid_api_key' ||
    code === 'unauthorized' ||
    code === 'forbidden' ||
    message.includes('api key') ||
    message.includes('unauthorized')
  ) {
    return { errorDomain: 'auth', errorCode: rawCode ?? 'auth_error', providerStatus };
  }

  if (
    code === 'econnreset' ||
    code === 'econnrefused' ||
    code === 'connectionrefused' ||
    code === 'enotfound' ||
    code === 'eai_again' ||
    message.includes('unable to connect') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up')
  ) {
    return { errorDomain: 'transport', errorCode: rawCode ?? 'network_error', providerStatus };
  }

  if (typeof status === 'number') {
    return {
      errorDomain: 'provider',
      errorCode: rawCode ?? `http_${status}`,
      providerStatus: String(status),
    };
  }

  if (type === 'validation_error' || message.includes('invalid') || message.includes('schema')) {
    return {
      errorDomain: 'application',
      errorCode: rawCode ?? 'application_error',
      providerStatus,
    };
  }

  return {
    errorDomain: 'unknown',
    errorCode: rawCode ?? 'unknown_error',
    providerStatus,
  };
}
