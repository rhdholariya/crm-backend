export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T | null;
  error: unknown;
}

export const successResponse = <T = unknown>(
  message: string,
  data: T | null = null,
): ApiResponse<T> => {
  return {
    success: true,
    message,
    data,
    error: null,
  };
};

export const errorResponse = (
  message: string,
  error: unknown = null,
): ApiResponse => {
  return {
    success: false,
    message,
    data: null,
    error,
  };
};
