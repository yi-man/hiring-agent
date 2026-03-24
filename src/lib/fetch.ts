import axios from 'axios';
import { env } from '@/lib/env';

const apiClient = axios.create({
  baseURL: env.NEXT_PUBLIC_API_BASE_URL,
  timeout: env.API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    if (env.NEXT_PUBLIC_ENABLE_DEBUG) {
      console.debug('API Request:', config);
    }
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response) => {
    if (env.NEXT_PUBLIC_ENABLE_DEBUG) {
      console.debug('API Response:', response);
    }
    return response;
  },
  (error) => {
    console.error('API Response Error:', error);
    return Promise.reject(error);
  },
);

export async function fetcher<T = unknown>(
  url: string,
  options?: { headers?: Record<string, string> },
): Promise<T> {
  try {
    const response = await apiClient.get(url, {
      headers: options?.headers,
    });
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as {
      response?: { data?: { message?: string } };
      message?: string;
    };
    throw new Error(axiosError.response?.data?.message || axiosError.message || 'Unknown error');
  }
}

export async function post<T = unknown>(
  url: string,
  data?: unknown,
  options?: { headers?: Record<string, string> },
): Promise<T> {
  try {
    const response = await apiClient.post(url, data, {
      headers: options?.headers,
    });
    return response.data;
  } catch (error: unknown) {
    const axiosError = error as {
      response?: { data?: { message?: string } };
      message?: string;
    };
    throw new Error(axiosError.response?.data?.message || axiosError.message || 'Unknown error');
  }
}

export { apiClient };
