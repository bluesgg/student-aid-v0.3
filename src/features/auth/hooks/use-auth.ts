/**
 * useAuth Hook
 * 
 * Provides authentication state and actions.
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  resendConfirmation,
} from "../api/auth";
import type { AuthUser } from "@/types/auth";
import { isApiOk } from "@/types/api";

// Query key for the current user
export const AUTH_QUERY_KEY = ["auth", "me"] as const;

/**
 * Hook for getting the current authenticated user
 */
export function useUser() {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const response = await getCurrentUser();
      if (isApiOk(response)) {
        return response.data;
      }
      return null;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

/**
 * Hook for login functionality
 */
export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: loginUser,
    onSuccess: (response) => {
      if (isApiOk(response)) {
        // Set the user in cache
        queryClient.setQueryData<AuthUser>(AUTH_QUERY_KEY, response.data.user);
        // Invalidate to refetch
        queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      }
    },
  });
}

/**
 * Hook for register functionality
 */
export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: registerUser,
    onSuccess: (response) => {
      if (isApiOk(response) && !response.data.needsEmailConfirmation) {
        // If no email confirmation needed (shouldn't happen with our config)
        // set the user in cache
        queryClient.setQueryData<AuthUser>(AUTH_QUERY_KEY, response.data.user);
        queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      }
    },
  });
}

/**
 * Hook for logout functionality
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      // Clear the user from cache
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      // Redirect to login
      router.push("/login");
    },
  });
}

/**
 * Hook for resending confirmation email
 */
export function useResendConfirmation() {
  return useMutation({
    mutationFn: resendConfirmation,
  });
}

/**
 * Combined auth hook with all auth functionality
 */
export function useAuth() {
  const userQuery = useUser();
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();
  const resendMutation = useResendConfirmation();

  return {
    // User state
    user: userQuery.data ?? null,
    isLoading: userQuery.isLoading,
    isAuthenticated: !!userQuery.data,

    // Actions
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    resendConfirmation: resendMutation.mutateAsync,

    // Mutation states
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    isResending: resendMutation.isPending,
  };
}


