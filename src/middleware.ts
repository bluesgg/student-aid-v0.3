/**
 * Next.js Middleware
 * 
 * Handles route protection and session refresh.
 * 
 * Protected routes: /courses/*, /account/*
 * Public routes: /login, /register, /api/auth/*, /auth/callback
 * 
 * Behavior:
 * - Unauthenticated users accessing protected routes → redirect to /login?next=...
 * - Authenticated users accessing /login or /register → redirect to /courses
 */

import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/supabase/middleware";

// Routes that require authentication
const PROTECTED_ROUTES = ["/courses", "/account"];

// Routes that are only for unauthenticated users
const AUTH_ROUTES = ["/login", "/register"];

// Routes that should be completely bypassed (no session check needed)
const BYPASS_ROUTES = [
  "/api/",
  "/auth/callback",
  "/_next/",
  "/favicon.ico",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if route should be bypassed
  for (const route of BYPASS_ROUTES) {
    if (pathname.startsWith(route)) {
      return NextResponse.next();
    }
  }

  // Get user and response from Supabase middleware client
  // This also refreshes the session if needed
  const { response, user } = await createMiddlewareSupabaseClient(request);

  // Check if this is a protected route
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Check if this is an auth route (login/register)
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);

  // Unauthenticated user trying to access protected route
  if (isProtectedRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user trying to access auth routes
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL("/courses", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};


