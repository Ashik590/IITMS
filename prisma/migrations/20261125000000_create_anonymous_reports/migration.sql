CREATE TYPE "ReportStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

CREATE TABLE "AnonymousReport" (
    "id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AnonymousReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnonymousReport_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "AnonymousReport_description_check" CHECK (length(trim("description")) > 0)
);

CREATE INDEX "AnonymousReport_status_createdAt_idx" ON "AnonymousReport"("status", "createdAt");
