"use client";

/**
 * P1 - Login Page
 * 
 * User login with email and password.
 * Redirects to /courses on success.
 * Handles EMAIL_NOT_CONFIRMED with resend option.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin, useResendConfirmation } from "@/features/auth";
import { isApiOk, isApiError } from "@/types/api";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginMutation = useLogin();
  const resendMutation = useResendConfirmation();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [showResend, setShowResend] = React.useState(false);
  const [resendSuccess, setResendSuccess] = React.useState(false);

  // Get next URL from query params
  const next = searchParams.get("next") ?? "/courses";

  // Check for callback errors
  const callbackError = searchParams.get("error");
  const callbackMessage = searchParams.get("message");

  React.useEffect(() => {
    if (callbackError && callbackMessage) {
      setError(decodeURIComponent(callbackMessage));
    }
  }, [callbackError, callbackMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setShowResend(false);
    setResendSuccess(false);

    const response = await loginMutation.mutateAsync({ email, password });

    if (isApiOk(response)) {
      // Login successful, redirect
      router.push(next);
      router.refresh();
    } else if (isApiError(response)) {
      setError(response.error.message);
      
      // Show resend option if email not confirmed
      if (response.error.code === "EMAIL_NOT_CONFIRMED") {
        setShowResend(true);
      }
    }
  };

  const handleResend = async () => {
    setResendSuccess(false);
    const response = await resendMutation.mutateAsync({ email });
    if (isApiOk(response)) {
      setResendSuccess(true);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-surface-900">
        Sign in to your account
      </h2>
      <p className="mt-1 text-sm text-surface-500">
        Access your courses and study materials
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          type="email"
          label="Email address"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        <Input
          type="password"
          label="Password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
            {showResend && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendMutation.isPending}
                  className="font-medium text-red-800 underline hover:text-red-900"
                >
                  {resendMutation.isPending
                    ? "Sending..."
                    : "Resend confirmation email"}
                </button>
              </div>
            )}
          </div>
        )}

        {resendSuccess && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
            Confirmation email sent! Please check your inbox.
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          isLoading={loginMutation.isPending}
        >
          Sign in
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-surface-500">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
