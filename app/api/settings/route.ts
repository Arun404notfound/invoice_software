import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { businessProfileSchema } from "@/lib/validations/business-profile";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.businessProfile.findFirst();
  return NextResponse.json({ profile });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = businessProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid business profile", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await prisma.businessProfile.findFirst();

  const profile = existing
    ? await prisma.businessProfile.update({
        where: { id: existing.id },
        data: parsed.data,
      })
    : await prisma.businessProfile.create({ data: parsed.data });

  await prisma.activityLog.create({
    data: {
      entityType: "BusinessProfile",
      entityId: profile.id,
      action: existing ? "UPDATE" : "CREATE",
      beforeJson: existing ? JSON.parse(JSON.stringify(existing)) : undefined,
      afterJson: JSON.parse(JSON.stringify(profile)),
      actorId: user.id,
    },
  });

  return NextResponse.json({ profile });
}
