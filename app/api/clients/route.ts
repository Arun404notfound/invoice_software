import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { clientSchema } from "@/lib/validations/client";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const archivedParam = searchParams.get("archived");
  const q = searchParams.get("q")?.trim();

  const clients = await prisma.client.findMany({
    where: {
      isArchived: archivedParam === "true",
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { company: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid client", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const client = await prisma.client.create({ data: parsed.data });

  await prisma.activityLog.create({
    data: {
      entityType: "Client",
      entityId: client.id,
      action: "CREATE",
      afterJson: JSON.parse(JSON.stringify(client)),
      actorId: user.id,
    },
  });

  return NextResponse.json({ client }, { status: 201 });
}
