import { sign as cryptoSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RsaSigner } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testCertDir = path.join(__dirname, "..", "..", ".testcert");

/**
 * SIGNER_MODE=mock. Signs with a throwaway software RSA key instead of the
 * physical token -- for exercising the full prepare/sign/embed/verify round
 * trip without hardware. Never use this for a real invoice.
 */
export function createSoftwareSigner(): RsaSigner {
  let certDer: Buffer;
  let keyPem: string;
  try {
    certDer = readFileSync(path.join(testCertDir, "cert.der"));
    keyPem = readFileSync(path.join(testCertDir, "key.pem"), "utf8");
  } catch {
    throw new Error(
      "No test certificate found. Run `npm run generate-test-cert` in local-signer/ first.",
    );
  }

  return {
    async getCertificateDer() {
      return certDer;
    },
    async getExtraCertificatesDer() {
      return [];
    },
    async sign(data: Buffer) {
      return cryptoSign("RSA-SHA256", data, keyPem);
    },
    async describe() {
      return { subject: "CN=Mock DSC Test Signer" };
    },
  };
}
