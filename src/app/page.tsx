import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";

/**
 * Root Page
 * 
 * Redirects to /courses (authenticated users) or /login (unauthenticated).
 */
export default async function RootPage() {
  const user = await getServerUser();
  
  if (user) {
    redirect("/courses");
  } else {
    redirect("/login");
  }
}
