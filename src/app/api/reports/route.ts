import { Prisma } from "@/generated/prisma/client";
import { endpoint, readBody, readQuery, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";
import { privateReportHeaders } from "@/lib/reports";
import { reportCreate, reportQuery } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return endpoint(async () => {
    requireAdmin(request);
    const { page, limit, status } = reportQuery.parse(readQuery(request));
    const where = status ? { status } : {};
    const [reports, total] = await db.$transaction([
      db.anonymousReport.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      db.anonymousReport.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return Response.json(
      { data: reports, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
      { headers: privateReportHeaders },
    );
  });
}

// Report records intentionally have no author or account identifier.
export function POST(request: Request) {
  return endpoint(async () => {
    const data = reportCreate.parse(await readBody(request));
    const report = await db.anonymousReport.create({ data });
    return Response.json(
      { data: { id: report.id, status: report.status } },
      { status: 201, headers: privateReportHeaders },
    );
  });
}
