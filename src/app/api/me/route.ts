import { auth } from "@/server/auth";
import { json } from "@/server/http";
import type { MeResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const u = session?.user;
  const user: MeResponse["user"] = u
    ? {
        id: u.id,
        name: u.name ?? null,
        email: u.email ?? null,
        image: u.image ?? null,
      }
    : null;
  return json<MeResponse>({ user });
}
