"use client";

/**
 * P1 - Login Page
 * 
 * User login with email and password.
 * Redirects to /courses on success.
 */

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // TODO: Implement actual login via /api/auth/login
    // For now, simulate loading
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoading(false);
    
    // Placeholder: Show error for demo
    setError("Login functionality will be implemented in Milestone 1.");
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
          </div>
        )}

        <Button type="submit" className="w-full" isLoading={isLoading}>
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

