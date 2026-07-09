import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  destroySessionByToken,
} from "@/lib/auth/session";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await destroySessionByToken(token);
  }
  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
