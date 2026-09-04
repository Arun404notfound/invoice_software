import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUploadsDir } from "@/lib/uploads";

/**
 * Serves logo/signature uploads when they live outside `public/` — i.e. in
 * the desktop app, where they're written to a writable per-user directory
 * (`UPLOADS_DIR`). On the web this route is unused (uploads sit under
 * `public/` and Next serves them statically).
 */

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await params;
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const ext = path.extname(name).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Unsupported type" }, { status: 400 });
  }

  try {
    const buffer = await readFile(path.join(getUploadsDir(), name));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
