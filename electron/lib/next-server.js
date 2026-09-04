"use strict";

const { spawn } = require("node:child_process");
const http = require("node:http");
const {
  standaloneServerDir,
  standaloneServerEntry,
} = require("./paths");

/**
 * Runs the Next.js standalone server (.next/standalone/server.js) as a
 * child of the Electron process, reusing Electron's bundled Node via
 * ELECTRON_RUN_AS_NODE. Resolves once the server answers HTTP.
 */
async function startNextServer({ port, env }) {
  const entry = standaloneServerEntry();
  const cwd = standaloneServerDir();

  const child = spawn(process.execPath, [entry], {
    cwd,
    env: {
      ...process.env,
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (d) => process.stdout.write(`[next] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[next] ${d}`));

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHttp(baseUrl, 30_000);

  return {
    baseUrl,
    stop() {
      child.kill("SIGTERM");
    },
  };
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`Next server did not start within ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, 300);
        }
      });
    };
    attempt();
  });
}

module.exports = { startNextServer };
