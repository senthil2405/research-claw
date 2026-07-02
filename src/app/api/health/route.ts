import { prisma } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for the platform (Fly health checks, uptime monitor).
 * Confirms the process is up AND can reach the database. Returns 503 if the DB
 * is unreachable so the load balancer can gate traffic / rollback.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
