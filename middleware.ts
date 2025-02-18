import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });

  if (!token) {
    const url = new URL('/auth/login', request.url);
    url.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/novel/:path*",
    "/api/settings/:path*",
    "/novels/:path*",
    "/settings",
    "/settings/:path*",
    "/admin/:path*"
  ],
}; 