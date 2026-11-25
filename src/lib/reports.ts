import type { ReportStatus } from "@/generated/prisma/client";

// Terminal reports stay terminal; a report must be reviewed before it is closed.
export function canTransitionReport(from: ReportStatus, to: ReportStatus) {
  return (from === "NEW" && to === "UNDER_REVIEW") ||
    (from === "UNDER_REVIEW" && (to === "RESOLVED" || to === "DISMISSED"));
}

export const privateReportHeaders = { "Cache-Control": "private, no-store" };
