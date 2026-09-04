import "server-only";
import path from "node:path";

/**
 * Where logo/signature uploads are written and how they're served back.
 *
 * - Web/dev: `public/uploads/` on disk, served by Next as `/uploads/<file>`.
 * - Desktop (Electron): the app bundle is read-only, so uploads go to a
 *   writable per-user directory passed in `UPLOADS_DIR`, and are served
 *   back through the `/api/media/<file>` route (which reads that same
 *   directory) since they're no longer under `public/`.
 * - Production web with Supabase configured: neither of these is used —
 *   the upload route short-circuits to Supabase Storage.
 */
export function getUploadsDir(): string {
  return (
    process.env.UPLOADS_DIR ?? path.join(process.cwd(), "public", "uploads")
  );
}

/** URL path a freshly stored `filename` should be referenced by. */
export function uploadPublicPath(filename: string): string {
  return process.env.UPLOADS_DIR
    ? `/api/media/${filename}`
    : `/uploads/${filename}`;
}

/** True when `url` points at a file the media route should serve from disk. */
export function isMediaRouteUrl(url: string): boolean {
  return url.startsWith("/api/media/");
}

/**
 * Resolves an `/api/media/<name>` URL to an absolute path inside the
 * uploads dir, or `null` if `name` tries to escape it.
 */
export function resolveMediaPath(url: string): string | null {
  const name = url.slice("/api/media/".length);
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return null;
  }
  return path.join(getUploadsDir(), name);
}
