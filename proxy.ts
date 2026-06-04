import { NextResponse, type NextRequest } from "next/server";

const protectedRoutes = [
  "/dashboard",
  "/pos",
  "/wholesale",
  "/inventory",
  "/purchasing",
  "/customers",
  "/suppliers",
  "/trace",
  "/reports",
  "/users",
  "/settings",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));
  const hasSession = request.cookies.has("pharmpos-session");

  if (isProtected && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/pos/:path*",
    "/wholesale/:path*",
    "/inventory/:path*",
    "/purchasing/:path*",
    "/customers/:path*",
    "/suppliers/:path*",
    "/trace/:path*",
    "/reports/:path*",
    "/users/:path*",
    "/settings/:path*",
    "/login",
  ],
};
