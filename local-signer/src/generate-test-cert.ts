// Generates a throwaway self-signed RSA-2048 certificate for SIGNER_MODE=mock.
// Not a DSC, not for real signing -- purely so the prepare -> sign -> embed
// -> verify round trip can be exercised without the physical token. Run once
// via `npm run generate-test-cert`; output is gitignored.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import forge from "node-forge";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", ".testcert");

function main() {
  if (existsSync(path.join(outDir, "cert.der"))) {
    console.log(".testcert/ already exists -- delete it first to regenerate.");
    return;
  }
  mkdirSync(outDir, { recursive: true });

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [{ name: "commonName", value: "Mock DSC Test Signer" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certDer = Buffer.from(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
    "binary",
  );
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  writeFileSync(path.join(outDir, "cert.der"), certDer);
  writeFileSync(path.join(outDir, "key.pem"), keyPem);
  console.log("Wrote local-signer/.testcert/cert.der and key.pem");
}

main();
