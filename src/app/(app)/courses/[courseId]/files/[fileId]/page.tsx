"use client";

/**
 * P5 - PDF Reader & AI Learning Page
 * 
 * Left: PDF viewer with navigation
 * Right: AI panel (stickers + Q&A)
 */

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

type ViewState = "loading" | "error" | "ready";

export default function PDFReaderPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const fileId = params.fileId as string;

  const [viewState, setViewState] = React.useState<ViewState>("loading");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages] = React.useState(25);
  const [fileName] = React.useState("Week1_Lecture.pdf");

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setViewState("ready");
    }, 1000);
    return () => clearTimeout(timer);
  }, [fileId]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top toolbar */}
      <div className="flex items-center justify-between border-b border-surface-200 bg-white px-4 py-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/courses/${courseId}`}
            className="text-surface-500 hover:text-surface-700"
          >
            ← Back to course
          </Link>
          <span className="text-surface-300">|</span>
          <span className="font-medium text-surface-900">{fileName}</span>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Button>
          <span className="min-w-[80px] text-center text-sm text-surface-600">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Button>
        </div>

        {/* Zoom controls placeholder */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
              />
            </svg>
          </Button>
          <span className="text-sm text-surface-500">100%</span>
          <Button variant="ghost" size="sm">
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
              />
            </svg>
          </Button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: PDF Viewer */}
        <div className="flex-1 overflow-auto bg-surface-100 p-4">
          {viewState === "loading" && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Spinner size="lg" />
                <p className="mt-2 text-sm text-surface-500">Loading PDF...</p>
              </div>
            </div>
          )}

          {viewState === "error" && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-red-600">Failed to load PDF</p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => setViewState("loading")}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {viewState === "ready" && (
            <div className="mx-auto max-w-3xl">
              {/* PDF Page Placeholder */}
              <div className="aspect-[8.5/11] rounded-lg bg-white shadow-lg">
                <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                  <div className="rounded-xl bg-surface-100 p-6">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mx-auto h-12 w-12 text-surface-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-surface-900">
                      PDF Viewer Placeholder
                    </h3>
                    <p className="mt-1 text-sm text-surface-500">
                      Page {currentPage} of {totalPages}
                    </p>
                    <p className="mt-4 text-xs text-surface-400">
                      PDF.js integration will be implemented in Milestone 4
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: AI Panel */}
        <div className="w-96 flex-shrink-0 border-l border-surface-200 bg-white">
          <div className="flex h-full flex-col">
            {/* AI Panel Header */}
            <div className="border-b border-surface-200 p-4">
              <Button className="w-full">
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
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Explain this page
              </Button>
            </div>

            {/* Stickers Area */}
            <div className="flex-1 overflow-auto p-4">
              {viewState === "loading" && (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-24 w-full rounded-lg" />
                    </div>
                  ))}
                </div>
              )}

              {viewState === "ready" && (
                <div className="space-y-4">
                  {/* Placeholder sticker */}
                  <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-700">
                        Auto
                      </span>
                      <span className="text-xs text-surface-400">Page 1</span>
                    </div>
                    <p className="text-sm text-surface-600">
                      AI-generated explanations will appear here after clicking
                      &quot;Explain this page&quot;.
                    </p>
                    <p className="mt-2 text-xs text-surface-400">
                      Sticker functionality will be implemented in Milestone 5
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Q&A Area */}
            <div className="border-t border-surface-200 p-4">
              <div className="mb-3 text-sm font-medium text-surface-700">
                Ask about this PDF
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ask a question..."
                  className="flex-1 rounded-lg border border-surface-300 px-3 py-2 text-sm placeholder:text-surface-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <Button size="icon">
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
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

