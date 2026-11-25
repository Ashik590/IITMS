CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "credits" DECIMAL(3,1) NOT NULL,
    "semester" INTEGER NOT NULL,
    "syllabusVersion" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Course_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Course_credits_check" CHECK ("credits" > 0 AND "credits" <= 10),
    CONSTRAINT "Course_semester_check" CHECK ("semester" BETWEEN 1 AND 8)
);

CREATE UNIQUE INDEX "Course_code_syllabusVersion_key" ON "Course"("code", "syllabusVersion");
CREATE INDEX "Course_semester_idx" ON "Course"("semester");

CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "venue" VARCHAR(200) NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Event_fee_check" CHECK ("fee" >= 0),
    CONSTRAINT "Event_capacity_check" CHECK ("capacity" > 0)
);

CREATE INDEX "Event_date_idx" ON "Event"("date");
