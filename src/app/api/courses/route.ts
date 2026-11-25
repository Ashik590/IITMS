import { Prisma } from "@/generated/prisma/client";
import { endpoint, readBody, readQuery, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";
import { courseJson } from "@/lib/serializers";
import { courseCreate, courseQuery } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return endpoint(async () => {
    const { page, limit, search, semester, syllabusVersion } =
      courseQuery.parse(readQuery(request));
    const where: Prisma.CourseWhereInput = {
      semester,
      syllabusVersion,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [courses, total] = await db.$transaction(
      [
        db.course.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        }),
        db.course.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return Response.json({
      data: courses.map(courseJson),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  });
}

export function POST(request: Request) {
  return endpoint(async () => {
    requireAdmin(request);
    const data = courseCreate.parse(await readBody(request));
    const course = await db.course.create({ data });
    return Response.json(
      { data: courseJson(course) },
      { status: 201, headers: { Location: `/api/courses/${course.id}` } },
    );
  });
}
