import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/settings-form";

export default async function SettingsPage() {
  const profile = await prisma.businessProfile.findFirst();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Business Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          This information appears on every invoice you send.
        </p>
      </div>
      <SettingsForm
        initialProfile={profile ? JSON.parse(JSON.stringify(profile)) : null}
      />
    </div>
  );
}
