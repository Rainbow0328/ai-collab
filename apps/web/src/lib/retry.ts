interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const defaultShouldRetry = (error: unknown, attempt: number) => {
  if (attempt >= 3) return false;
  if (error instanceof TypeError && error.message === 'Failed to fetch') return true;
  if (error instanceof Error && error.message.includes('NetworkError')) return true;
  if (error instanceof Response && error.status >= 500) return true;
  if (error instanceof Response && error.status === 429) return true;
  return false;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = defaultShouldRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = delay * (0.5 + Math.random() * 0.5);

      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  throw lastError;
}
