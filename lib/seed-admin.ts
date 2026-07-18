import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Creates the admin user (idempotent — upserts by email) and a starter
 * business profile (only if none exists yet) from ADMIN_EMAIL/ADMIN_NAME/
 * ADMIN_PASSWORD. Shared by the local `db:seed` script and the one-time
 * production setup route, so both stay in sync.
 */
export async function seedAdminAndBusinessProfile(): Promise<{
  userEmail: string;
  businessProfileCreated: boolean;
}> {
  const adminEmail = requireEnv("ADMIN_EMAIL");
  const adminName = requireEnv("ADMIN_NAME");
  const adminPassword = requireEnv("ADMIN_PASSWORD");

  const passwordHash = await hashPassword(adminPassword);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: adminName, passwordHash },
    create: { email: adminEmail, name: adminName, passwordHash },
  });

  const existingProfile = await prisma.businessProfile.findFirst();
  let businessProfileCreated = false;

  if (!existingProfile) {
    await prisma.businessProfile.create({
      data: {
        legalName: "TechGrah Innovations",
        tradeName: "TechGrah",
        gstin: "27AAAPZ1234C1Z5",
        pan: "AAAPZ1234C",
        addressLine1: "402, Skyline Business Park",
        addressLine2: "Baner Road",
        city: "Pune",
        state: "Maharashtra",
        stateCode: "27",
        pincode: "411045",
        email: adminEmail,
        phone: "9876543210",
        website: "www.techgrahinnovations.com",
        bankName: "HDFC Bank",
        accountNumber: "50100123456789",
        ifsc: "HDFC0001234",
        upiId: "techgrah@okhdfcbank",
        invoiceNumberFormat: "TG/{FY}/{seq}",
        brandColor: "#1A56DB",
        defaultTaxRatePercent: 18,
        defaultDueDays: 15,
        defaultTermsText:
          "Payment due within the agreed terms. Late payments may attract interest as per applicable law.",
        defaultNotesText: "Thank you for your business.",
        exportDeclarationText:
          "Supply meant for export under LUT without payment of IGST",
      },
    });
    businessProfileCreated = true;
  }

  return { userEmail: user.email, businessProfileCreated };
}
