import type { ApiResponse } from "@loopmarshal/protocol";

export const successResponse = <T>(
  data: T,
  requestId?: string
): ApiResponse<T> => {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    ...(requestId ? { requestId } : {})
  };
};

export const errorResponse = (
  code: string,
  message: string,
  details?: unknown,
  requestId?: string
): ApiResponse<never> => {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    },
    timestamp: new Date().toISOString(),
    ...(requestId ? { requestId } : {})
  };
};
