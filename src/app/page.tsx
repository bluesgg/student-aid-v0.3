import { redirect } from "next/navigation";

/**
 * Root Page
 * 
 * Redirects to /courses (authenticated users) or /login (unauthenticated).
 * For now, always redirect to /login as auth is not yet implemented.
 */
export default function RootPage() {
  // TODO: Check auth status and redirect accordingly
  redirect("/login");
}

