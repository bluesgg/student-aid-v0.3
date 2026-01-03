/**
 * TanStack Query Client Configuration
 * 
 * Conservative defaults for MVP:
 * - Limited retries
 * - Reasonable stale time
 * - Refetch on window focus for fresh data
 */

import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data considered fresh for 30 seconds
        staleTime: 30 * 1000,
        // Cache time before garbage collection: 5 minutes
        gcTime: 5 * 60 * 1000,
        // Retry failed requests once with exponential backoff
        retry: 1,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Refetch when window regains focus
        refetchOnWindowFocus: true,
        // Don't refetch on reconnect by default
        refetchOnReconnect: false,
      },
      mutations: {
        // No retries for mutations
        retry: false,
      },
    },
  });
}

// Singleton for SSR - created once per request
let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  // Server: always make a new client
  if (typeof window === "undefined") {
    return createQueryClient();
  }
  
  // Browser: reuse existing client
  if (!browserQueryClient) {
    browserQueryClient = createQueryClient();
  }
  
  return browserQueryClient;
}





