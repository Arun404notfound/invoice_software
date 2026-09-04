"use strict";

/**
 * Seeds the admin user + starter business profile by calling the app's own
 * idempotent POST /api/setup (gated by SETUP_SECRET). Reusing the HTTP
 * endpoint keeps this in one place — the same code path Vercel bootstrap
 * uses — instead of importing server internals into the Electron process.
 */
async function seedViaSetup({ baseUrl, setupSecret }) {
  const res = await fetch(`${baseUrl}/api/setup`, {
    method: "POST",
    headers: { "x-setup-secret": setupSecret },
  });
  if (!res.ok) {
    throw new Error(`/api/setup failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

module.exports = { seedViaSetup };
