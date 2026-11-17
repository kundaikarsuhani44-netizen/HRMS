import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

/**
 * Clerk only establishes WHO the user is. Every page, action and API route then loads the
 * employee row and role from our database on the server (src/lib/auth.ts) — the middleware
 * is not the access-control layer.
 */
const clerk = clerkMiddleware();

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if ((process.env.AUTH_MODE === 'demo' || process.env.AUTH_MODE === 'password')) return NextResponse.next();
  return clerk(req, ev);
}

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
