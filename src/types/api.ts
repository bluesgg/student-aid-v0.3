/**
 * API Response Types
 * 
 * Unified response structure for all API endpoints.
 * Success responses return { ok: true, data: T }
 * Error responses return { ok: false, error: { code, message } }
 */

// --- Success Response ---
export type ApiOk<T> = {
  ok: true;
  data: T;
};

// --- Error Response ---
export type ApiError = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
  };
};

// --- Unified Response ---
export type ApiResponse<T> = ApiOk<T> | ApiError;

// --- Error Codes (from 03_api_design.md) ---
export type ErrorCode =
  // General
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  // Auth / User
  | "EMAIL_ALREADY_EXISTS"
  // Course / File
  | "COURSE_LIMIT_REACHED"
  | "DUPLICATE_COURSE_NAME"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_NAME_CONFLICT"
  | "PAGE_RANGE_TOO_LARGE"
  | "SCANNED_PDF_UNSUPPORTED"
  // Sticker
  | "STICKER_NOT_FOUND"
  | "STICKER_UPDATE_FORBIDDEN"
  // Quota / Rate Limit
  | "QUOTA_EXCEEDED"
  | "AUTO_EXPLAIN_LIMIT_REACHED";

// --- HTTP Status Code Mapping ---
export const errorCodeToHttpStatus: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
  EMAIL_ALREADY_EXISTS: 400,
  COURSE_LIMIT_REACHED: 400,
  DUPLICATE_COURSE_NAME: 400,
  UNSUPPORTED_FILE_TYPE: 400,
  FILE_NAME_CONFLICT: 400,
  PAGE_RANGE_TOO_LARGE: 400,
  SCANNED_PDF_UNSUPPORTED: 400,
  STICKER_NOT_FOUND: 404,
  STICKER_UPDATE_FORBIDDEN: 403,
  QUOTA_EXCEEDED: 429,
  AUTO_EXPLAIN_LIMIT_REACHED: 429,
};

// --- Helper type guard ---
export function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return !response.ok;
}

export function isApiOk<T>(response: ApiResponse<T>): response is ApiOk<T> {
  return response.ok;
}

