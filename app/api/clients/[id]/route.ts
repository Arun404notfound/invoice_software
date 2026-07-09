import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { clientSchema } from "@/lib/validations/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ client });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid client", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const client = await prisma.client.update({
    where: { id },
    data: parsed.data,
  });

  await prisma.activityLog.create({
    data: {
      entityType: "Client",
      entityId: client.id,
      action: "UPDATE",
      beforeJson: JSON.parse(JSON.stringify(existing)),
      afterJson: JSON.parse(JSON.stringify(client)),
      actorId: user.id,
    },
  });

  return NextResponse.json({ client });
}

const archiveSchema = z.object({ isArchived: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = archiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const client = await prisma.client.update({
    where: { id },
    data: { isArchived: parsed.data.isArchived },
  });

  await prisma.activityLog.create({
    data: {
      entityType: "Client",
      entityId: client.id,
      action: parsed.data.isArchived ? "ARCHIVE" : "UNARCHIVE",
      beforeJson: JSON.parse(JSON.stringify(existing)),
      afterJson: JSON.parse(JSON.stringify(client)),
      actorId: user.id,
    },
  });

  return NextResponse.json({ client });
}
