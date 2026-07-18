// Diagnostic script: run this BEFORE wiring up the full server, to confirm
// the driver path is right and the token is visible. Usage:
//   PKCS11_MODULE_PATH=/path/to/driver.dylib npx tsx src/list-slots.ts
import "dotenv/config";
import * as graphene from "graphene-pk11";

const modulePath = process.env.PKCS11_MODULE_PATH;
if (!modulePath) {
  console.error("Set PKCS11_MODULE_PATH to your Watchdata driver .dylib path first.");
  console.error("See local-signer/README.md for how to find it.");
  process.exit(1);
}

const mod = graphene.Module.load(modulePath, "DSC Token");
mod.initialize();

try {
  const allSlots = mod.getSlots(false);
  console.log(`Module loaded. ${allSlots.length} slot(s) total.\n`);

  for (let i = 0; i < allSlots.length; i++) {
    const slot = allSlots.items(i);
    const info = slot.getSlotInfo();
    const hasToken = (slot.flags & graphene.SlotFlag.TOKEN_PRESENT) !== 0;
    console.log(`Slot ${i}: ${info.slotDescription.trim()}`);
    console.log(`  Token present: ${hasToken}`);
    if (!hasToken) continue;

    const token = slot.getToken();
    console.log(`  Token label: ${token.label.trim()}`);
    console.log(`  Manufacturer: ${token.manufacturerID.trim()}`);

    const session = slot.open(graphene.SessionFlag.SERIAL_SESSION);
    const certs = session.find({ class: graphene.ObjectClass.CERTIFICATE });
    console.log(`  Certificates found: ${certs.length}`);
    for (let c = 0; c < certs.length; c++) {
      const cert = certs.items(c).toType<import("graphene-pk11").X509Certificate>();
      console.log(`    [${c}] subject: ${cert.subject}`);
    }
    session.close();
  }
} finally {
  mod.finalize();
}
