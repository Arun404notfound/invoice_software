import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { User } from "@/lib/generated/prisma/client";

export const SESSION_COOKIE_NAME = "tg_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Creates a DB-backed session row for `userId` and returns the opaque token
 * to be stored in the cookie. Does not itself set the cookie — call from a
 * Route Handler / Server Action and use `setSessionCookie`.
 */
export async function createSession(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.session.create({ data: { id: token, userId, expiresAt } });
  return { token, expiresAt };
}

/** Deletes the session row for the given token (idempotent). */
export async function destroySessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: token } });
}

/** Must be called from a Route Handler or Server Action. */
export async function setSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    // The desktop app runs a production build served over plain
    // http://127.0.0.1, where a `Secure` cookie would be dropped by the
    // browser and login would silently fail. DESKTOP_APP=1 (set only by
    // Electron) relaxes this; web deployments still get Secure in prod.
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.DESKTOP_APP !== "1",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Must be called from a Route Handler or Server Action. */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Reads the session cookie (readable from Server Components too) and
 * resolves the current user, or null if there's no valid, unexpired
 * session. Lazily deletes expired session rows as it encounters them.
 */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await destroySessionByToken(token);
    return null;
  }

  return session.user;
}
