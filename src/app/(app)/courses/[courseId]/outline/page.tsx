"use client";

/**
 * P6 - Course Outline Page
 * 
 * Displays AI-generated course outline with high-frequency topics
 * and typical problems for exam preparation.
 */

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageShell, PageHeader } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";

type ViewState = "loading" | "empty" | "error" | "ready";

interface OutlineSection {
  title: string;
  children?: OutlineSection[];
  highFrequencyTopics?: string[];
  typicalProblems?: string[];
}

export default function CourseOutlinePage() {
  const params = useParams();
  const courseId = params.courseId as string;

  const [viewState, setViewState] = React.useState<ViewState>("loading");
  const [outline, setOutline] = React.useState<OutlineSection[]>([]);

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setViewState("ready");
      setOutline([
        {
          title: "Part I: Foundations",
          children: [
            {
              title: "Chapter 1: Limits and Continuity",
              highFrequencyTopics: [
                "Limit definition & notation",
                "One-sided limits",
                "Continuity at a point",
                "Common limit techniques",
              ],
              typicalProblems: [
                "Compute limits using algebraic manipulation",
                "Determine continuity at a point",
                "Use the squeeze theorem",
              ],
            },
            {
              title: "Chapter 2: Derivatives",
              highFrequencyTopics: [
                "Definition of derivative",
                "Power rule",
                "Product and quotient rules",
                "Chain rule",
              ],
              typicalProblems: [
                "Find derivatives using rules",
                "Implicit differentiation",
                "Related rates problems",
              ],
            },
          ],
        },
        {
          title: "Part II: Applications",
          children: [
            {
              title: "Chapter 3: Applications of Derivatives",
              highFrequencyTopics: [
                "Extreme values",
                "Mean value theorem",
                "Curve sketching",
                "Optimization problems",
              ],
              typicalProblems: [
                "Find local and global extrema",
                "Sketch curves using first and second derivative tests",
                "Solve optimization word problems",
              ],
            },
          ],
        },
      ]);
    }, 1200);

    return () => clearTimeout(timer);
  }, [courseId]);

  // Breadcrumb
  const Breadcrumb = () => (
    <nav className="mb-2 flex items-center gap-2 text-sm text-surface-500">
      <Link href="/courses" className="hover:text-surface-700">
        My Courses
      </Link>
      <span>/</span>
      <Link
        href={`/courses/${courseId}`}
        className="hover:text-surface-700"
      >
        Calculus I
      </Link>
      <span>/</span>
      <span className="text-surface-900">Course Outline</span>
    </nav>
  );

  return (
    <PageShell>
      <Breadcrumb />

      <PageHeader
        title="Course Outline"
        description="AI-generated study guide with key topics and typical problems"
        actions={
          <Button variant="outline" disabled={viewState !== "ready"}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Regenerate outline
          </Button>
        }
      />

      {/* Loading State */}
      {viewState === "loading" && (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <div className="ml-4 space-y-2">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {viewState === "empty" && (
        <EmptyState
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          }
          title="No outline yet"
          description="Upload some course materials first, then generate an outline for exam prep."
          action={
            <Link href={`/courses/${courseId}`}>
              <Button>Go to course</Button>
            </Link>
          }
        />
      )}

      {/* Error State */}
      {viewState === "error" && (
        <ErrorState
          title="Failed to generate outline"
          message="We couldn't generate the course outline. Please try again."
          onRetry={() => setViewState("loading")}
        />
      )}

      {/* Ready State - Outline Tree */}
      {viewState === "ready" && (
        <div className="space-y-6">
          {outline.map((part, partIndex) => (
            <div
              key={partIndex}
              className="rounded-xl border border-surface-200 bg-white p-6"
            >
              <h2 className="text-lg font-semibold text-surface-900">
                {part.title}
              </h2>

              <div className="mt-4 space-y-4">
                {part.children?.map((chapter, chapterIndex) => (
                  <div
                    key={chapterIndex}
                    className="rounded-lg border border-surface-100 bg-surface-50 p-4"
                  >
                    <h3 className="font-medium text-surface-800">
                      {chapter.title}
                    </h3>

                    {chapter.highFrequencyTopics && (
                      <div className="mt-3">
                        <h4 className="text-sm font-medium text-brand-700">
                          High-Frequency Topics
                        </h4>
                        <ul className="mt-1 list-inside list-disc text-sm text-surface-600">
                          {chapter.highFrequencyTopics.map((topic, i) => (
                            <li key={i}>{topic}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {chapter.typicalProblems && (
                      <div className="mt-3">
                        <h4 className="text-sm font-medium text-orange-700">
                          Typical Problems
                        </h4>
                        <ul className="mt-1 list-inside list-disc text-sm text-surface-600">
                          {chapter.typicalProblems.map((problem, i) => (
                            <li key={i}>{problem}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p className="text-center text-xs text-surface-400">
            Course outline generation will be fully implemented in Milestone 6
          </p>
        </div>
      )}
    </PageShell>
  );
}


