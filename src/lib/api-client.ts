/**
 * API Client
 * 
 * Unified fetch wrapper for all /api/* endpoints.
 * Handles JSON parsing, error mapping, and timeout.
 */

import type { ApiResponse, ApiError, ErrorCode } from "@/types/api";

// Default timeout for requests (10 seconds)
const DEFAULT_TIMEOUT_MS = 10000;

// Base configuration
interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  timeout?: number;
}

/**
 * Custom error class for API errors
 */
export class ApiClientError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/**
 * Fetch JSON from an API endpoint with unified error handling
 */
export async function fetchJson<T>(
  url: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const { body, timeout = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    };

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Try to parse JSON response
    let data: unknown;
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      // Non-JSON response, treat as error
      const text = await response.text();
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: text || "Unexpected response format",
        },
      };
    }

    // If response already has our ApiResponse shape, return it
    if (isApiResponseShape(data)) {
      return data as ApiResponse<T>;
    }

    // Otherwise, wrap successful response
    if (response.ok) {
      return { ok: true, data: data as T };
    }

    // Map HTTP errors to our error format
    return {
      ok: false,
      error: {
        code: mapHttpStatusToErrorCode(response.status),
        message: typeof data === "object" && data && "message" in data
          ? String((data as { message: string }).message)
          : `Request failed with status ${response.status}`,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Request timed out. Please try again.",
          },
        };
      }
    }

    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      },
    };
  }
}

// --- Helper Functions ---

/**
 * Check if response has ApiResponse shape
 */
function isApiResponseShape(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  
  const obj = data as Record<string, unknown>;
  if (typeof obj.ok !== "boolean") return false;
  
  if (obj.ok === true) {
    return "data" in obj;
  } else {
    return (
      "error" in obj &&
      typeof obj.error === "object" &&
      obj.error !== null &&
      "code" in (obj.error as object) &&
      "message" in (obj.error as object)
    );
  }
}

/**
 * Map HTTP status codes to error codes
 */
function mapHttpStatusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return "INVALID_INPUT";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 429:
      return "QUOTA_EXCEEDED";
    default:
      return "INTERNAL_ERROR";
  }
}

// --- Convenience Methods ---

export const api = {
  get: <T>(url: string, options?: Omit<FetchOptions, "method" | "body">) =>
    fetchJson<T>(url, { ...options, method: "GET" }),

  post: <T>(url: string, body?: unknown, options?: Omit<FetchOptions, "method" | "body">) =>
    fetchJson<T>(url, { ...options, method: "POST", body }),

  patch: <T>(url: string, body?: unknown, options?: Omit<FetchOptions, "method" | "body">) =>
    fetchJson<T>(url, { ...options, method: "PATCH", body }),

  delete: <T>(url: string, options?: Omit<FetchOptions, "method" | "body">) =>
    fetchJson<T>(url, { ...options, method: "DELETE" }),
};

// --- Error Helper for Route Handlers ---

/**
 * Create a standardized error response for Route Handlers
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  status?: number
): ApiError & { status: number } {
  const errorCodeToStatus: Record<string, number> = {
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

  return {
    ok: false,
    error: { code, message },
    status: status ?? errorCodeToStatus[code] ?? 500,
  };
}


