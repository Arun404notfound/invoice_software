import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

async function main() {
  const adminEmail = requireEnv("ADMIN_EMAIL");
  const adminName = requireEnv("ADMIN_NAME");
  const adminPassword = requireEnv("ADMIN_PASSWORD");

  const passwordHash = await hashPassword(adminPassword);
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: adminName, passwordHash },
    create: { email: adminEmail, name: adminName, passwordHash },
  });
  console.log(`Seeded admin user: ${user.email}`);

  const existingProfile = await prisma.businessProfile.findFirst();
  if (existingProfile) {
    console.log("Business profile already exists, skipping.");
  } else {
    const profile = await prisma.businessProfile.create({
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
        bankName: "HDFC Bank",
        accountNumber: "50100123456789",
        ifsc: "HDFC0001234",
        upiId: "techgrah@okhdfcbank",
        invoiceNumberFormat: "TG/{FY}/{seq}",
        brandColor: "#10B981",
        defaultTemplateId: "CHARCOAL",
        defaultTaxRatePercent: 18,
        defaultDueDays: 15,
        defaultTermsText:
          "Payment due within the agreed terms. Late payments may attract interest as per applicable law.",
        defaultNotesText: "Thank you for your business.",
        exportDeclarationText:
          "Supply meant for export under LUT without payment of IGST",
      },
    });
    console.log(`Seeded business profile: ${profile.legalName}`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
