"use client";

/**
 * Global Providers
 * 
 * Wraps the app with necessary client-side providers:
 * - TanStack Query for server state management
 * - Future: Toast notifications, etc.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  // Use the singleton query client
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}


