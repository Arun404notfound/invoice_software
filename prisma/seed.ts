import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { seedAdminAndBusinessProfile } from "@/lib/seed-admin";

async function main() {
  const result = await seedAdminAndBusinessProfile();
  console.log(`Seeded admin user: ${result.userEmail}`);
  console.log(
    result.businessProfileCreated
      ? "Seeded business profile."
      : "Business profile already exists, skipping.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
