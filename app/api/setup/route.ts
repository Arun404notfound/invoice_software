import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { seedAdminAndBusinessProfile } from "@/lib/seed-admin";

/**
 * One-time production bootstrap: creates the admin user + starter business
 * profile without needing local shell/database access. Gated by
 * SETUP_SECRET (set it in Vercel, hit this once after your first deploy,
 * then feel free to remove the env var — the handler is idempotent either
 * way, since seedAdminAndBusinessProfile upserts the user and only creates
 * a business profile if none exists).
 */
function isAuthorized(request: Request): boolean {
  const setupSecret = process.env.SETUP_SECRET;
  if (!setupSecret) return false;

  const provided = request.headers.get("x-setup-secret") ?? "";
  const expected = Buffer.from(setupSecret);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await seedAdminAndBusinessProfile();
  return NextResponse.json(result);
}
