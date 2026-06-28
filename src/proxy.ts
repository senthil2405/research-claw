import { NextResponse, type NextRequest } from "next/server";
import { ANON_COOKIE } from "@/lib/constants";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Ensure every visitor carries an httpOnly `rc_anon` cookie so that
 * logged-out ownership (Document.anonId) works. Minted lazily if absent.
 */
export function proxy(req: NextRequest) {
  const res = NextResponse.next();

  if (!req.cookies.get(ANON_COOKIE)?.value) {
    res.cookies.set(ANON_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR,
    });
  }

  return res;
}

export const config = {
  // Run on app + API routes; skip static assets and the pdf worker.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|pdf.worker.min.mjs|pdf.worker.min.js).*)",
  ],
};
