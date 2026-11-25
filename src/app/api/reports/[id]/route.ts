import { ApiError, endpoint, type ItemContext, readBody, readId, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";
import { canTransitionReport, privateReportHeaders } from "@/lib/reports";
import { reportStatusUpdate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, context: ItemContext) {
  return endpoint(async () => {
    requireAdmin(request);
    const id = await readId(context);
    const report = await db.anonymousReport.findUnique({ where: { id } });
    if (!report) throw new ApiError(404, "NOT_FOUND", "The requested report does not exist.");
    return Response.json({ data: report }, { headers: privateReportHeaders });
  });
}

export function PATCH(request: Request, context: ItemContext) {
  return endpoint(async () => {
    requireAdmin(request);
    const id = await readId(context);
    const { status } = reportStatusUpdate.parse(await readBody(request));
    const current = await db.anonymousReport.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, "NOT_FOUND", "The requested report does not exist.");
    if (!canTransitionReport(current.status, status)) {
      throw new ApiError(409, "INVALID_TRANSITION", "This report status change is not allowed.");
    }
    const updated = await db.anonymousReport.updateMany({
      where: { id, status: current.status },
      data: { status },
    });
    if (updated.count !== 1) {
      throw new ApiError(409, "CONFLICT", "The report changed while it was being reviewed.");
    }
    const report = await db.anonymousReport.findUniqueOrThrow({ where: { id } });
    return Response.json({ data: report }, { headers: privateReportHeaders });
  });
}
