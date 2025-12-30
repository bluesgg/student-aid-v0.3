"use client";

/**
 * P2 - Register Page
 * 
 * New user registration with email and password.
 * Shows email confirmation message after successful registration.
 */

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRegister, useResendConfirmation } from "@/features/auth";
import { isApiOk, isApiError } from "@/types/api";

type ViewState = "form" | "email-confirmation";

export default function RegisterPage() {
  const registerMutation = useRegister();
  const resendMutation = useResendConfirmation();

  const [viewState, setViewState] = React.useState<ViewState>("form");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    const response = await registerMutation.mutateAsync({ email, password });

    if (isApiOk(response)) {
      if (response.data.needsEmailConfirmation) {
        // Show email confirmation view
        setViewState("email-confirmation");
      } else {
        // Shouldn't happen with our config, but handle it
        window.location.href = "/courses";
      }
    } else if (isApiError(response)) {
      setError(response.error.message);
    }
  };

  const handleResend = async () => {
    setResendSuccess(false);
    const response = await resendMutation.mutateAsync({ email });
    if (isApiOk(response)) {
      setResendSuccess(true);
    }
  };

  // Email confirmation view
  if (viewState === "email-confirmation") {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-surface-900">
          Check your email
        </h2>
        <p className="mt-2 text-sm text-surface-500">
          We&apos;ve sent a confirmation link to{" "}
          <span className="font-medium text-surface-700">{email}</span>.
          <br />
          Please click the link to verify your account.
        </p>

        <div className="mt-6 space-y-3">
          {resendSuccess && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
              Confirmation email resent! Please check your inbox.
            </div>
          )}

          <Button
            variant="secondary"
            onClick={handleResend}
            isLoading={resendMutation.isPending}
            className="w-full"
          >
            Resend confirmation email
          </Button>

          <p className="text-sm text-surface-500">
            Already confirmed?{" "}
            <Link
              href="/login"
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Registration form view
  return (
    <div>
      <h2 className="text-xl font-semibold text-surface-900">
        Create your account
      </h2>
      <p className="mt-1 text-sm text-surface-500">
        Start organizing and learning from your course materials
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
          placeholder="At least 8 characters"
          helperText="Must be at least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />

        <Input
          type="password"
          label="Confirm password"
          placeholder="Repeat your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
        />

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          isLoading={registerMutation.isPending}
        >
          Create account
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-surface-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
