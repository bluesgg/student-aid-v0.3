"use client";

/**
 * P7 - Account Usage & Quotas Page
 * 
 * Displays course count and AI usage quotas.
 */

import * as React from "react";
import { PageShell, PageHeader } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";

type ViewState = "loading" | "error" | "ready";

interface QuotaItem {
  label: string;
  description: string;
  used: number;
  limit: number;
  type: "course" | "ai";
}

export default function UsagePage() {
  const [viewState, setViewState] = React.useState<ViewState>("loading");
  const [quotas, setQuotas] = React.useState<QuotaItem[]>([]);

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setViewState("ready");
      setQuotas([
        {
          label: "Courses Created",
          description: "For this experiment, you can create up to 6 courses.",
          used: 3,
          limit: 6,
          type: "course",
        },
        {
          label: "Learning Interactions",
          description:
            "AI explanations and Q&A usage during this experiment period.",
          used: 23,
          limit: 50,
          type: "ai",
        },
        {
          label: "Document Summaries",
          description: "Full document summarization quota.",
          used: 2,
          limit: 10,
          type: "ai",
        },
        {
          label: "Section Summaries",
          description: "Chapter/section level summarization quota.",
          used: 5,
          limit: 15,
          type: "ai",
        },
        {
          label: "Course Outlines",
          description: "Course-level outline generation quota.",
          used: 1,
          limit: 3,
          type: "ai",
        },
      ]);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  const getProgressColor = (used: number, limit: number) => {
    const percentage = (used / limit) * 100;
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 70) return "bg-yellow-500";
    return "bg-brand-500";
  };

  const getStatusText = (used: number, limit: number) => {
    const remaining = limit - used;
    if (remaining <= 0) return "Limit reached";
    if (remaining <= 3) return `${remaining} remaining`;
    return `${used} / ${limit} used`;
  };

  return (
    <PageShell maxWidth="lg">
      <PageHeader
        title="Usage & Quotas"
        description="Track your course and AI feature usage during this experiment"
      />

      {/* Loading State */}
      {viewState === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-surface-200 bg-white p-5"
            >
              <Skeleton className="mb-2 h-5 w-32" />
              <Skeleton className="mb-4 h-4 w-full" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {viewState === "error" && (
        <ErrorState
          title="Failed to load usage data"
          message="We couldn't load your usage information. Please try again."
          onRetry={() => setViewState("loading")}
        />
      )}

      {/* Ready State */}
      {viewState === "ready" && (
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 flex-shrink-0 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className="font-medium text-blue-900">
                  Experiment Period
                </h3>
                <p className="mt-1 text-sm text-blue-700">
                  These quotas are temporary limits for our initial testing
                  period. They help us understand usage patterns and ensure a
                  good experience for all users.
                </p>
              </div>
            </div>
          </div>

          {/* Quota Cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {quotas.map((quota, index) => {
              const percentage = Math.min(
                100,
                (quota.used / quota.limit) * 100
              );
              const isNearLimit = quota.limit - quota.used <= 3;
              const isAtLimit = quota.used >= quota.limit;

              return (
                <div
                  key={index}
                  className={`rounded-xl border bg-white p-5 ${
                    isAtLimit
                      ? "border-red-200"
                      : isNearLimit
                        ? "border-yellow-200"
                        : "border-surface-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-surface-900">
                        {quota.label}
                      </h3>
                      <p className="mt-0.5 text-sm text-surface-500">
                        {quota.description}
                      </p>
                    </div>
                    <div
                      className={`rounded-lg px-2 py-1 text-xs font-medium ${
                        quota.type === "course"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-brand-100 text-brand-700"
                      }`}
                    >
                      {quota.type === "course" ? "Account" : "AI"}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span
                        className={
                          isAtLimit
                            ? "font-medium text-red-600"
                            : "text-surface-600"
                        }
                      >
                        {getStatusText(quota.used, quota.limit)}
                      </span>
                      <span className="text-surface-400">
                        {percentage.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-100">
                      <div
                        className={`h-full rounded-full transition-all ${getProgressColor(quota.used, quota.limit)}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-surface-400">
            Quota tracking will be fully implemented in Milestone 7
          </p>
        </div>
      )}
    </PageShell>
  );
}

