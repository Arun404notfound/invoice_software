"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

/**
 * Applies the Prisma migration SQL files directly, so the packaged app
 * never needs the Prisma CLI or its schema engine at runtime. Migrations
 * are plain CREATE/ALTER statements (checked in `prisma/migrations/`), each
 * run once inside a transaction and recorded in `_tg_desktop_migrations`.
 *
 * This DB is managed only by the desktop app — don't point `prisma migrate`
 * at it as well, or the two bookkeeping tables will disagree.
 */
async function runMigrations({ connectionString, migrationsDir }) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_tg_desktop_migrations" (
        "name" TEXT PRIMARY KEY,
        "applied_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await client.query('SELECT "name" FROM "_tg_desktop_migrations"')).rows.map(
        (r) => r.name,
      ),
    );

    const folders = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const folder of folders) {
      if (applied.has(folder)) continue;
      const sqlPath = path.join(migrationsDir, folder, "migration.sql");
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, "utf8");

      process.stdout.write(`[migrate] applying ${folder}\n`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO "_tg_desktop_migrations" ("name") VALUES ($1)',
          [folder],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${folder} failed: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

module.exports = { runMigrations };
