import { Prisma } from "@/generated/prisma/client";
import { endpoint, readBody, readQuery, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";
import { eventJson } from "@/lib/serializers";
import { eventCreate, eventQuery } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return endpoint(async () => {
    const { page, limit, search } = eventQuery.parse(readQuery(request));
    const where: Prisma.EventWhereInput = search ? { title: { contains: search, mode: "insensitive" } } : {};
    const [events, total] = await db.$transaction([
      db.event.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ date: "asc" }, { id: "asc" }] }),
      db.event.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return Response.json({ data: events.map(eventJson), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });
}

export function POST(request: Request) {
  return endpoint(async () => {
    requireAdmin(request);
    const data = eventCreate.parse(await readBody(request));
    const event = await db.event.create({ data });
    return Response.json({ data: eventJson(event) }, { status: 201, headers: { Location: `/api/events/${event.id}` } });
  });
}
