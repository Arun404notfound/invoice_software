import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="dark flex min-h-screen bg-background text-foreground">
      <AppSidebar userName={user.name} />
      <main className="flex-1 overflow-y-auto p-6 md:p-10">{children}</main>
    </div>
  );
}
