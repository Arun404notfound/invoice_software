"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Starts a private PostgreSQL instance bundled inside the app — no system
 * Postgres, no Homebrew. Data lives under the app's userData dir so it
 * survives upgrades.
 *
 * `embedded-postgres` ships platform binaries via its deps
 * (@embedded-postgres/darwin-arm64), which electron-builder unpacks from
 * the asar (see `asarUnpack` in package.json). It's an ESM package, hence
 * the dynamic import from this CommonJS module.
 */
const DB_NAME = "techgrah_invoice";
const DB_USER = "techgrah";

async function startPostgres({ userDataDir, password, port }) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");

  const databaseDir = path.join(userDataDir, "pgdata");
  const alreadyInitialised = fs.existsSync(path.join(databaseDir, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: DB_USER,
    password,
    port,
    persistent: true,
  });

  if (!alreadyInitialised) {
    await pg.initialise();
  }
  await pg.start();

  if (!alreadyInitialised) {
    try {
      await pg.createDatabase(DB_NAME);
    } catch (err) {
      if (!/already exists/i.test(String(err && err.message))) throw err;
    }
  }

  const connectionString = `postgresql://${DB_USER}:${encodeURIComponent(
    password,
  )}@127.0.0.1:${port}/${DB_NAME}`;

  return {
    connectionString,
    async stop() {
      try {
        await pg.stop();
      } catch (err) {
        process.stderr.write(`[pg] stop failed: ${err}\n`);
      }
    },
  };
}

module.exports = { startPostgres, DB_NAME, DB_USER };
