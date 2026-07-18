import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { buildDetachedCms } from "./cms.js";
import { createSoftwareSigner } from "./signers/softwareSigner.js";
import { createPkcs11Signer } from "./signers/pkcs11Signer.js";
import type { RsaSigner } from "./signers/types.js";

const PORT = Number(process.env.PORT ?? 7734);
const SIGNER_MODE = process.env.SIGNER_MODE === "pkcs11" ? "pkcs11" : "mock";
// Vercel-hosted pages fetching http://127.0.0.1 are exempt from mixed-content
// blocking (the loopback exception), so this stays plain HTTP by design --
// it never leaves the machine the token is plugged into. Set this to your
// deployed app's exact origin; "*" is fine for local dev.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

const CHAR_CODE_CTRL_C = 3;
const CHAR_CODE_BACKSPACE = 8;
const CHAR_CODE_DEL = 127;

async function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.setRawMode?.(true);

    let value = "";
    const onData = (char: string) => {
      const code = char.charCodeAt(0);
      if (char === "\n" || char === "\r") {
        stdin.setRawMode?.(wasRaw ?? false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (code === CHAR_CODE_CTRL_C) {
        process.exit(1);
      }
      if (code === CHAR_CODE_BACKSPACE || code === CHAR_CODE_DEL) {
        value = value.slice(0, -1);
        return;
      }
      value += char;
      process.stdout.write("*");
    };
    stdin.on("data", onData);
  });
}

async function buildSigner(): Promise<RsaSigner> {
  if (SIGNER_MODE === "mock") {
    console.log("SIGNER_MODE=mock -- using a software test certificate, NOT the real DSC.");
    return createSoftwareSigner();
  }

  const modulePath = process.env.PKCS11_MODULE_PATH;
  if (!modulePath) {
    throw new Error(
      "PKCS11_MODULE_PATH is not set. See local-signer/README.md for how to find your " +
        "Watchdata driver's .dylib path.",
    );
  }
  const pin = process.env.DSC_PIN || (await promptHidden("Enter DSC token PIN: "));
  return createPkcs11Signer({ modulePath, pin });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  });
  res.end(payload);
}

async function main() {
  const signer = await buildSigner();
  const { subject } = await signer.describe();
  console.log(`Signer ready: ${subject}`);

  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, mode: SIGNER_MODE, subject });
      return;
    }

    if (req.method === "POST" && req.url === "/sign") {
      try {
        const body = JSON.parse(await readBody(req)) as {
          digestBase64?: string;
          signingTime?: string;
        };
        if (!body.digestBase64 || !body.signingTime) {
          sendJson(res, 400, { error: "digestBase64 and signingTime are required" });
          return;
        }

        const messageDigest = Buffer.from(body.digestBase64, "base64");
        const signingTime = new Date(body.signingTime);
        const [certificateDer, extraCertificatesDer] = await Promise.all([
          signer.getCertificateDer(),
          signer.getExtraCertificatesDer(),
        ]);

        const cms = await buildDetachedCms({
          messageDigest,
          signingTime,
          certificateDer,
          extraCertificatesDer,
          sign: (data) => signer.sign(data),
        });

        const { subject: signerSubject } = await signer.describe();
        sendJson(res, 200, {
          signatureBase64: cms.toString("base64"),
          signerCertSubject: signerSubject,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Signing failed";
        console.error("Sign request failed:", message);
        sendJson(res, 500, { error: message });
      }
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`DSC local signer listening on http://127.0.0.1:${PORT} (mode: ${SIGNER_MODE})`);
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    const maybeClosable = signer as RsaSigner & { close?: () => void };
    maybeClosable.close?.();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start local signer:", error);
  process.exit(1);
});
