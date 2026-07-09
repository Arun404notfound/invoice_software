import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const UPLOADS_BUCKET = "uploads";

let cachedClient: SupabaseClient | null = null;

/**
 * Lazily-created Supabase client using the service role key — server-side
 * only, bypasses RLS, since we're not using Supabase's own auth system
 * (this app has its own session-cookie auth). Only needed in production;
 * local dev falls back to local disk uploads (see the upload route) so
 * this is never called without SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY set.
 */
function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use Supabase Storage",
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function uploadToSupabaseStorage(
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const client = getSupabaseClient();
  const { error } = await client.storage
    .from(UPLOADS_BUCKET)
    .upload(filename, buffer, { contentType, upsert: false });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data } = client.storage.from(UPLOADS_BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}
