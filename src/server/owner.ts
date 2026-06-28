import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { ANON_COOKIE } from "@/lib/constants";

/** Identifies the owner of a Document: either a logged-in user or an anon session. */
export type OwnerRef = { userId: string } | { anonId: string };

/**
 * Resolve the current request's owner.
 *
 * - Logged in: returns `{ userId }`, and lazily migrates any docs owned by the
 *   current `rc_anon` cookie to this user (idempotent).
 * - Logged out: returns `{ anonId }` from the `rc_anon` cookie. Middleware
 *   guarantees the cookie exists; if it is somehow missing we mint a fallback id.
 */
export async function resolveOwner(): Promise<OwnerRef> {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const anonId = cookieStore.get(ANON_COOKIE)?.value;

  const userId = session?.user?.id;
  if (userId) {
    // A session cookie can outlive its User row (e.g. the dev DB was reset).
    // Trusting it would violate the Document.userId foreign key on writes, so
    // verify the row exists; if not, fall back to the anonymous identity.
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (userExists) {
      if (anonId) {
        // Claim anonymous docs created before sign-in.
        await migrateAnonToUser(anonId, userId);
      }
      return { userId };
    }
  }

  // Logged out (or a stale session) — middleware should have set the cookie.
  return { anonId: anonId ?? crypto.randomUUID() };
}

/** Build a Prisma `where` fragment scoping a query to an owner. */
export function ownerWhere(o: OwnerRef): { userId: string } | { anonId: string } {
  return "userId" in o ? { userId: o.userId } : { anonId: o.anonId };
}

/** Reassign all Document rows from an anon session to a user. Idempotent. */
export async function migrateAnonToUser(
  anonId: string,
  userId: string,
): Promise<void> {
  await prisma.document.updateMany({
    where: { anonId },
    data: { userId, anonId: null },
  });
}
