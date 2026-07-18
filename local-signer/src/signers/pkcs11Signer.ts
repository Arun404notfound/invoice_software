import type { RsaSigner } from "./types.js";

export interface Pkcs11SignerOptions {
  /** Path to the Watchdata PKCS#11 driver .dylib (see README for how to find it). */
  modulePath: string;
  /** Token PIN, collected once at process start -- never sent over the network. */
  pin: string;
  /** Slot index to use if the token exposes more than one. Defaults to the first slot with a token present. */
  slotIndex?: number;
}

/**
 * SIGNER_MODE=pkcs11. Talks to the physical DSC USB token via PKCS#11.
 *
 * This is the one piece of local-signer that genuinely cannot be exercised
 * without the real Watchdata ProxKey token plugged into a Mac -- see
 * local-signer/README.md for the on-device verification steps (start with
 * `npm run list-slots` before wiring this into the full server).
 *
 * `graphene-pk11` is an optionalDependency (it wraps a native PKCS#11
 * binding that needs Xcode Command Line Tools to build) so it's imported
 * lazily here rather than at module load time.
 */
export async function createPkcs11Signer(
  options: Pkcs11SignerOptions,
): Promise<RsaSigner> {
  let graphene: typeof import("graphene-pk11");
  try {
    graphene = await import("graphene-pk11");
  } catch {
    throw new Error(
      "graphene-pk11 isn't installed. Run `npm install` in local-signer/ on a machine with " +
        "Xcode Command Line Tools installed (`xcode-select --install`), then retry.",
    );
  }

  const mod = graphene.Module.load(options.modulePath, "DSC Token");
  mod.initialize();

  const slots = mod.getSlots(true);
  const slotIndex = options.slotIndex ?? 0;
  if (slotIndex >= slots.length) {
    mod.finalize();
    throw new Error(
      `No token found at slot ${slotIndex} (module reports ${slots.length} slot(s) with a token present). Is the DSC plugged in?`,
    );
  }
  const slot = slots.items(slotIndex);

  const session = slot.open(
    graphene.SessionFlag.SERIAL_SESSION | graphene.SessionFlag.RW_SESSION,
  );
  session.login(options.pin);

  const certObjects = session.find({ class: graphene.ObjectClass.CERTIFICATE });
  if (certObjects.length === 0) {
    session.logout();
    mod.finalize();
    throw new Error("No certificate object found on the token.");
  }
  const certObject = certObjects
    .items(0)
    .toType<import("graphene-pk11").X509Certificate>();
  const certificateDer = Buffer.from(certObject.value);

  const privateKeyObjects = session.find({
    class: graphene.ObjectClass.PRIVATE_KEY,
  });
  if (privateKeyObjects.length === 0) {
    session.logout();
    mod.finalize();
    throw new Error("No private key object found on the token.");
  }
  const privateKey = privateKeyObjects.items(0);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    try {
      session.logout();
    } catch {
      // already logged out
    }
    session.close();
    mod.finalize();
  }

  return {
    async getCertificateDer() {
      return certificateDer;
    },
    async getExtraCertificatesDer() {
      // The Watchdata token typically only stores the leaf certificate;
      // Adobe/most verifiers can still build the chain via AIA if the CA
      // certs are trusted locally. Add intermediate/root DER files here if
      // you need a fully embedded chain.
      return [];
    },
    async sign(data: Buffer) {
      const signer = session.createSign("SHA256_RSA_PKCS", privateKey);
      signer.update(data);
      return Buffer.from(signer.final());
    },
    async describe() {
      return { subject: String(certObject.subject) };
    },
    // Not part of RsaSigner, but the caller should invoke this once done --
    // see server.ts, which owns the request lifecycle and calls it in a
    // `finally` block.
    close,
  } as RsaSigner & { close: () => void };
}
