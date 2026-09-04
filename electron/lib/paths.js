"use strict";

const path = require("node:path");
const { app } = require("electron");

/**
 * Resolves the on-disk locations the desktop app needs, working the same
 * way in `npm run electron:dev` (running from the repo) and in a packaged
 * `.app` (resources unpacked next to the Electron binary).
 *
 * Packaged layout (electron-builder `extraResources`):
 *   <app>/Contents/Resources/
 *     app/                      <- .next/standalone (contains server.js)
 *       .next/static/
 *       public/
 *     migrations/               <- prisma/migrations/**
 */
const isPackaged = app.isPackaged;
const repoRoot = path.join(__dirname, "..", "..");
const resourcesPath = process.resourcesPath || repoRoot;

function standaloneServerDir() {
  return isPackaged
    ? path.join(resourcesPath, "app")
    : path.join(repoRoot, ".next", "standalone");
}

function standaloneServerEntry() {
  return path.join(standaloneServerDir(), "server.js");
}

function migrationsDir() {
  return isPackaged
    ? path.join(resourcesPath, "migrations")
    : path.join(repoRoot, "prisma", "migrations");
}

/** Writable, per-user data root — Postgres data dir, uploads, config live here. */
function userDataDir() {
  return app.getPath("userData");
}

module.exports = {
  isPackaged,
  repoRoot,
  standaloneServerDir,
  standaloneServerEntry,
  migrationsDir,
  userDataDir,
};
