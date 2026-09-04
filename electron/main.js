"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, dialog, shell } = require("electron");

// Stable app identity BEFORE anything reads app.getPath('userData'), so the
// data dir is ~/Library/Application Support/TechGrah in dev and packaged
// alike.
app.setName("TechGrah");

const { findFreePort } = require("./lib/ports");
const paths = require("./lib/paths");
const config = require("./lib/config");
const { startPostgres } = require("./lib/postgres");
const { runMigrations } = require("./lib/migrate");
const { startPdfService } = require("./lib/pdf-service");
const { startNextServer } = require("./lib/next-server");
const { seedViaSetup } = require("./lib/seed");

// Single instance — a second launch just focuses the running window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let appBaseUrl = null;
let shuttingDown = false;
const teardown = [];

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "TechGrah",
    backgroundColor: "#0a0a0a",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  mainWindow.loadURL(url);

  // Keep app navigation in-window; send anything else to the real browser.
  const isLocal = (u) =>
    u.startsWith("http://127.0.0.1") || u.startsWith("http://localhost");
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isLocal(target)) return { action: "allow" };
    shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!isLocal(target)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showLoadingWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 220,
    resizable: false,
    frame: false,
    backgroundColor: "#0a0a0a",
    title: "TechGrah",
  });
  win.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`
      <body style="margin:0;display:flex;align-items:center;justify-content:center;
        height:100vh;background:#0a0a0a;color:#e5e5e5;
        font:14px -apple-system,BlinkMacSystemFont,sans-serif">
        <div style="text-align:center">
          <div style="font-size:16px;font-weight:600;margin-bottom:8px">TechGrah</div>
          <div style="opacity:.7">Starting the database and app…</div>
        </div>
      </body>`),
  );
  return win;
}

function maybeShowCredentials(cfg) {
  if (cfg.values.credentialsShown) return;

  const credFile = path.join(paths.userDataDir(), "first-run-credentials.txt");
  fs.writeFileSync(
    credFile,
    [
      "TechGrah — first-run login",
      "",
      `Email:    ${cfg.values.adminEmail}`,
      `Password: ${cfg.values.adminPassword}`,
      "",
      "Keep this file somewhere safe. You can change the password later",
      "from inside the app (Settings).",
      "",
    ].join("\n"),
    "utf8",
  );

  dialog.showMessageBoxSync(mainWindow, {
    type: "info",
    title: "Your login",
    message: "TechGrah is ready.",
    detail:
      `Sign in with:\n\n` +
      `Email:  ${cfg.values.adminEmail}\n` +
      `Password:  ${cfg.values.adminPassword}\n\n` +
      `These have also been saved to:\n${credFile}`,
    buttons: ["Got it"],
    defaultId: 0,
  });

  cfg.markCredentialsShown();
}

async function boot() {
  const userDataDir = paths.userDataDir();
  const cfg = config.load(userDataDir);

  const loading = showLoadingWindow();

  const pgPort = await findFreePort();
  const nextPort = await findFreePort();

  // 1. Database
  const pg = await startPostgres({
    userDataDir,
    password: cfg.values.dbPassword,
    port: pgPort,
  });
  teardown.push(() => pg.stop());

  // 2. Schema
  await runMigrations({
    connectionString: pg.connectionString,
    migrationsDir: paths.migrationsDir(),
  });

  // 3. PDF bridge (Electron's own Chromium)
  const pdf = await startPdfService({ secret: cfg.values.pdfSecret });
  teardown.push(() => pdf.stop());

  // 4. App server
  const uploadsDir = path.join(userDataDir, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });

  const next = await startNextServer({
    port: nextPort,
    env: {
      DESKTOP_APP: "1",
      DATABASE_URL: pg.connectionString,
      SESSION_SECRET: cfg.values.sessionSecret,
      SETUP_SECRET: cfg.values.setupSecret,
      ADMIN_EMAIL: cfg.values.adminEmail,
      ADMIN_NAME: cfg.values.adminName,
      ADMIN_PASSWORD: cfg.values.adminPassword,
      APP_URL: `http://127.0.0.1:${nextPort}`,
      UPLOADS_DIR: uploadsDir,
      ELECTRON_PDF_URL: pdf.url,
      ELECTRON_PDF_SECRET: cfg.values.pdfSecret,
    },
  });
  teardown.push(() => next.stop());

  // 5. Seed admin + business profile (idempotent)
  await seedViaSetup({
    baseUrl: next.baseUrl,
    setupSecret: cfg.values.setupSecret,
  });

  appBaseUrl = next.baseUrl;
  loading.destroy();
  createWindow(appBaseUrl);
  maybeShowCredentials(cfg);
}

async function runTeardown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const tasks = teardown.splice(0).reverse();
  for (const task of tasks) {
    try {
      await task();
    } catch (err) {
      process.stderr.write(`[shutdown] ${err}\n`);
    }
  }
}

app.whenReady().then(() => {
  boot().catch(async (err) => {
    await runTeardown();
    dialog.showErrorBox(
      "TechGrah couldn't start",
      String(err && err.stack ? err.stack : err),
    );
    app.exit(1);
  });
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// macOS: closing the window keeps the app (and its services) alive in the
// Dock, like a normal Mac app; clicking the Dock icon reopens the window.
app.on("activate", () => {
  if (mainWindow === null && appBaseUrl) createWindow(appBaseUrl);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  runTeardown().finally(() => app.exit(0));
});
