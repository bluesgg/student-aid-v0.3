'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import * as authApi from '../api'
import { isApiError, ApiClientError } from '@/lib/api-client'
import { signedUrlCache } from '@/lib/pdf/url-cache'

/**
 * Hook for getting current user
 */
export function useUser() {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const result = await authApi.getMe()
      if (isApiError(result)) {
        return null
      }
      return result.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })
}

/**
 * Hook for login
 */
export function useLogin() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => {
      const result = await authApi.login(email, password)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['user'], data.user)
      router.push('/courses')
    },
  })
}

/**
 * Hook for registration
 */
export function useRegister() {
  return useMutation({
    mutationFn: async ({
      email,
      password,
    }: {
      email: string
      password: string
    }) => {
      const result = await authApi.register(email, password)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
  })
}

/**
 * Hook for logout
 */
export function useLogout() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async () => {
      const result = await authApi.logout()
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
    onSuccess: () => {
      // Clear signed URL cache (session-specific)
      signedUrlCache.clear()

      // Clear React Query cache
      queryClient.setQueryData(['user'], null)
      queryClient.clear()

      router.push('/login')
    },
  })
}

/**
 * Hook for resending confirmation email
 */
export function useResendConfirmation() {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const result = await authApi.resendConfirmation(email)
      if (isApiError(result)) {
        throw new ApiClientError(result.error)
      }
      return result.data
    },
  })
}
