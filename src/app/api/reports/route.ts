import { endpoint, readBody } from "@/lib/api";
import { db } from "@/lib/db";
import { privateReportHeaders } from "@/lib/reports";
import { reportCreate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
