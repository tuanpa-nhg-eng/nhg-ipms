import createMiddleware from 'next-intl/middleware';
import { routing } from './routing';

// Place this file at the project root as `middleware.ts` (not inside i18n/)
// when wiring into a real Next.js app. Kept here as part of the bundle.
export default createMiddleware(routing);

export const config = {
  // Match all paths except API, Next internals and static files.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
