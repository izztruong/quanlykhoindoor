import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "kho_token";
const PUBLIC_PATHS = ["/login"];

// Optimistic auth check only (presence of the cookie) — the API is the real
// authority and rejects invalid/expired tokens with 401 on every request.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = Boolean(request.cookies.get(COOKIE_NAME)?.value);
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasToken && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (hasToken && isPublicPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
