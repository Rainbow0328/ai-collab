import { useState, useCallback } from "react";
import type { ApiResponse } from "@/types";
import { withRetry } from "@/lib/retry";

export function useApi<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  options?: { retry?: boolean }
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = options?.retry
          ? await withRetry(() => fn(...args))
          : await fn(...args);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [fn, options?.retry]
  );

  return {
    execute,
    isLoading,
    error,
  };
}

export function useApiLazy<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  options?: { retry?: boolean }
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (...args: Args): Promise<T> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = options?.retry
          ? await withRetry(() => fn(...args))
          : await fn(...args);
        setData(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [fn, options?.retry]
  );

  return {
    data,
    execute,
    isLoading,
    error,
  };
}
