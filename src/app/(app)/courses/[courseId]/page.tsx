"use client";

/**
 * P4 - Course Detail & Resource Center
 * 
 * Displays files grouped by type (Lecture, Homework, Exam, Other).
 * Supports file upload and management.
 */

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageShell, PageHeader } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";

// File types matching API design
type FileType = "Lecture" | "Homework" | "Exam" | "Other";

interface CourseFile {
  id: string;
  name: string;
  type: FileType;
  pageCount: number;
  isScanned: boolean;
  uploadedAt: string;
}

interface Course {
  id: string;
  name: string;
  school?: string;
  term?: string;
}

type ViewState = "loading" | "empty" | "error" | "data";

const FILE_TYPE_ORDER: FileType[] = ["Lecture", "Homework", "Exam", "Other"];

const FILE_TYPE_LABELS: Record<FileType, string> = {
  Lecture: "Lecture Notes",
  Homework: "Homework",
  Exam: "Exams",
  Other: "Other Materials",
};

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  
  const [viewState, setViewState] = React.useState<ViewState>("loading");
  const [course, setCourse] = React.useState<Course | null>(null);
  const [files, setFiles] = React.useState<CourseFile[]>([]);

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setViewState("data");
      setCourse({
        id: courseId,
        name: "Calculus I",
        school: "Demo University",
        term: "Spring 2025",
      });
      setFiles([
        {
          id: "f1",
          name: "Week1_Lecture.pdf",
          type: "Lecture",
          pageCount: 25,
          isScanned: false,
          uploadedAt: "2025-01-10T08:00:00Z",
        },
        {
          id: "f2",
          name: "Week2_Lecture.pdf",
          type: "Lecture",
          pageCount: 30,
          isScanned: false,
          uploadedAt: "2025-01-17T08:00:00Z",
        },
        {
          id: "f3",
          name: "Homework_1.pdf",
          type: "Homework",
          pageCount: 5,
          isScanned: false,
          uploadedAt: "2025-01-12T08:00:00Z",
        },
        {
          id: "f4",
          name: "Midterm_2024.pdf",
          type: "Exam",
          pageCount: 12,
          isScanned: true,
          uploadedAt: "2025-01-05T08:00:00Z",
        },
      ]);
    }, 800);

    return () => clearTimeout(timer);
  }, [courseId]);

  // Group files by type
  const filesByType = React.useMemo(() => {
    const grouped: Record<FileType, CourseFile[]> = {
      Lecture: [],
      Homework: [],
      Exam: [],
      Other: [],
    };
    files.forEach((file) => {
      grouped[file.type].push(file);
    });
    return grouped;
  }, [files]);

  // Breadcrumb
  const Breadcrumb = () => (
    <nav className="mb-2 flex items-center gap-2 text-sm text-surface-500">
      <Link href="/courses" className="hover:text-surface-700">
        My Courses
      </Link>
      <span>/</span>
      <span className="text-surface-900">{course?.name || "..."}</span>
    </nav>
  );

  return (
    <PageShell>
      <Breadcrumb />
      
      <PageHeader
        title={course?.name || "Loading..."}
        description={
          course
            ? [course.school, course.term].filter(Boolean).join(" • ")
            : undefined
        }
        actions={
          <div className="flex gap-2">
            <Link href={`/courses/${courseId}/outline`}>
              <Button variant="outline">
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
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                Course outline
              </Button>
            </Link>
            <Button>
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Upload PDF
            </Button>
          </div>
        }
      />

      {/* Loading State */}
      {viewState === "loading" && (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-24 rounded-lg" />
                ))}
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
          title="No files yet"
          description="Upload your course PDFs to get started with AI-powered learning."
          action={<Button>Upload your first PDF</Button>}
        />
      )}

      {/* Error State */}
      {viewState === "error" && (
        <ErrorState
          title="Failed to load course"
          message="We couldn't load this course. Please try again."
          onRetry={() => setViewState("loading")}
        />
      )}

      {/* Data State - Files grouped by type */}
      {viewState === "data" && (
        <div className="space-y-8">
          {FILE_TYPE_ORDER.map((type) => {
            const typeFiles = filesByType[type];
            if (typeFiles.length === 0) return null;

            return (
              <section key={type}>
                <h2 className="mb-3 flex items-center gap-2 text-lg font-medium text-surface-900">
                  <FileTypeIcon type={type} />
                  {FILE_TYPE_LABELS[type]}
                  <span className="ml-1 text-sm font-normal text-surface-400">
                    ({typeFiles.length})
                  </span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {typeFiles.map((file) => (
                    <FileCard key={file.id} file={file} courseId={courseId} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

// File Card Component
function FileCard({ file, courseId }: { file: CourseFile; courseId: string }) {
  return (
    <Link
      href={`/courses/${courseId}/files/${file.id}`}
      className="group flex items-start gap-3 rounded-lg border border-surface-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm"
    >
      {/* PDF Icon */}
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-surface-900 group-hover:text-brand-700">
          {file.name}
        </h3>
        <p className="mt-0.5 text-xs text-surface-500">
          {file.pageCount} pages
          {file.isScanned && (
            <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-yellow-700">
              Scanned
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

// File Type Icon Component
function FileTypeIcon({ type }: { type: FileType }) {
  const iconClass = "h-5 w-5";
  
  switch (type) {
    case "Lecture":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`${iconClass} text-blue-600`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M12 14l9-5-9-5-9 5 9 5z" />
          <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        </svg>
      );
    case "Homework":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`${iconClass} text-green-600`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      );
    case "Exam":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`${iconClass} text-orange-600`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    default:
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`${iconClass} text-surface-500`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
  }
}





