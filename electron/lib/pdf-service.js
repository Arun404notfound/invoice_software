"use strict";

const http = require("node:http");
const os = require("node:os");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { BrowserWindow } = require("electron");

/**
 * Tiny loopback HTTP service the Next server calls to turn invoice HTML
 * into a PDF (see lib/pdf/generate-pdf.ts). Uses Electron's own Chromium
 * via webContents.printToPDF, so the app doesn't bundle a second ~170MB
 * Puppeteer Chromium. Bound to 127.0.0.1 and gated by a per-launch secret.
 */
async function renderPdf(html) {
  const tmpFile = path.join(
    os.tmpdir(),
    `tg-invoice-${crypto.randomUUID()}.html`,
  );
  await fs.writeFile(tmpFile, html, "utf8");

  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, images: true, sandbox: true },
  });

  try {
    await win.loadFile(tmpFile);
    // The template inlines images as data URIs, so there's nothing async to
    // wait on beyond load; a short settle keeps fonts/layout stable.
    await new Promise((r) => setTimeout(r, 150));
    return await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  } finally {
    win.destroy();
    fs.unlink(tmpFile).catch(() => {});
  }
}

function startPdfService({ secret }) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method !== "POST" || req.url !== "/render") {
        res.writeHead(404).end();
        return;
      }
      if (req.headers["x-pdf-secret"] !== secret) {
        res.writeHead(403).end();
        return;
      }

      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        try {
          const { html } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (typeof html !== "string") throw new Error("missing html");
          const pdf = await renderPdf(html);
          res.writeHead(200, { "Content-Type": "application/pdf" }).end(pdf);
        } catch (err) {
          res
            .writeHead(500, { "Content-Type": "text/plain" })
            .end(String(err && err.message ? err.message : err));
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/render`,
        stop() {
          server.close();
        },
      });
    });
  });
}

module.exports = { startPdfService };
