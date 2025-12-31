"use client";

/**
 * P3 - My Courses Page
 * 
 * Displays list of user's courses with create/edit/delete functionality.
 */

import * as React from "react";
import { PageShell, PageHeader } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Placeholder course type
interface Course {
  id: string;
  name: string;
  school?: string;
  term?: string;
  fileCount: number;
  lastVisitedAt?: string;
}

// Simulated states for demo
type ViewState = "loading" | "empty" | "error" | "data";

export default function CoursesPage() {
  const [viewState, setViewState] = React.useState<ViewState>("loading");
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [newCourseName, setNewCourseName] = React.useState("");

  // Simulate loading states for demo
  React.useEffect(() => {
    const timer = setTimeout(() => {
      // Demo: cycle through states, default to data with sample courses
      setViewState("data");
      setCourses([
        {
          id: "1",
          name: "Calculus I",
          school: "Demo University",
          term: "Spring 2025",
          fileCount: 8,
          lastVisitedAt: "2025-01-15T10:00:00Z",
        },
        {
          id: "2",
          name: "Linear Algebra",
          school: "Demo University",
          term: "Spring 2025",
          fileCount: 5,
          lastVisitedAt: "2025-01-14T15:30:00Z",
        },
        {
          id: "3",
          name: "Statistics 101",
          school: "Demo University",
          term: "Fall 2024",
          fileCount: 12,
        },
      ]);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleCreateCourse = () => {
    // TODO: Implement via /api/courses POST
    if (newCourseName.trim()) {
      const newCourse: Course = {
        id: Date.now().toString(),
        name: newCourseName,
        fileCount: 0,
      };
      setCourses((prev) => [...prev, newCourse]);
      setNewCourseName("");
      setIsCreateDialogOpen(false);
    }
  };

  // Demo state switcher (hidden in production)
  const StateSwitcher = () => (
    <div className="mb-4 flex gap-2 rounded-lg bg-surface-100 p-2 text-xs">
      <span className="text-surface-500">Demo states:</span>
      {(["loading", "empty", "error", "data"] as ViewState[]).map((state) => (
        <button
          key={state}
          onClick={() => setViewState(state)}
          className={`rounded px-2 py-1 ${
            viewState === state
              ? "bg-brand-600 text-white"
              : "bg-white text-surface-600 hover:bg-surface-200"
          }`}
        >
          {state}
        </button>
      ))}
    </div>
  );

  return (
    <PageShell>
      <PageHeader
        title="My Courses"
        description="Organize and access your course materials"
        actions={
          <Button onClick={() => setIsCreateDialogOpen(true)}>
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            New course
          </Button>
        }
      />

      {/* Demo state switcher - remove in production */}
      <StateSwitcher />

      {/* Loading State */}
      {viewState === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="h-40" />
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
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          }
          title="No courses yet"
          description="Create your first course to start organizing your study materials."
          action={
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              Create your first course
            </Button>
          }
        />
      )}

      {/* Error State */}
      {viewState === "error" && (
        <ErrorState
          title="Failed to load courses"
          message="We couldn't load your courses. Please check your connection and try again."
          onRetry={() => setViewState("loading")}
        />
      )}

      {/* Data State - Course Grid */}
      {viewState === "data" && courses.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}

      {/* Create Course Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new course</DialogTitle>
            <DialogDescription>
              Add a course to organize your study materials.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              label="Course name"
              placeholder="e.g., Calculus I"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              autoFocus
            />
            {/* TODO: Add school and term fields */}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateCourse} disabled={!newCourseName.trim()}>
              Create course
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// Course Card Component
function CourseCard({ course }: { course: Course }) {
  return (
    <a
      href={`/courses/${course.id}`}
      className="group block rounded-xl border border-surface-200 bg-white p-5 shadow-sm transition-all hover:border-brand-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-lg font-medium text-surface-900 group-hover:text-brand-700">
            {course.name}
          </h3>
          {(course.school || course.term) && (
            <p className="mt-1 truncate text-sm text-surface-500">
              {[course.school, course.term].filter(Boolean).join(" • ")}
            </p>
          )}
        </div>
        {/* More actions button placeholder */}
        <button
          onClick={(e) => {
            e.preventDefault();
            // TODO: Show dropdown menu
          }}
          className="ml-2 rounded-lg p-1 text-surface-400 opacity-0 transition-opacity hover:bg-surface-100 hover:text-surface-600 group-hover:opacity-100"
        >
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
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-surface-500">
        <span className="flex items-center gap-1">
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          {course.fileCount} {course.fileCount === 1 ? "file" : "files"}
        </span>
      </div>
    </a>
  );
}


