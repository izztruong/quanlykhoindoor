import { NextResponse } from "next/server";

// This used to redirect based on the auth cookie's presence, but that only
// works when the frontend and API share a domain. In production the API
// lives on a different domain (e.g. Render vs Vercel), so the auth cookie is
// scoped to the API's domain and is never visible to this middleware — it
// would always see "no cookie" and bounce every request back to /login, even
// right after a successful login. Real enforcement already happens
// client-side in (app)/layout.tsx via a genuine `/api/auth/me` call (which
// does carry the cross-domain cookie, since that's a normal fetch with
// credentials rather than a same-site cookie read), so this middleware is
// now just a pass-through.
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
