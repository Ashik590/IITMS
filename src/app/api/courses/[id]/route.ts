import { ApiError, endpoint, type ItemContext, readBody, readId, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";
import { courseJson } from "@/lib/serializers";
import { courseUpdate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, context: ItemContext) {
  return endpoint(async () => {
    const id = await readId(context);
    const course = await db.course.findUnique({ where: { id } });
    if (!course) throw new ApiError(404, "NOT_FOUND", "The requested course does not exist.");
    return Response.json({ data: courseJson(course) });
  });
}

export function PATCH(request: Request, context: ItemContext) {
  return endpoint(async () => {
    requireAdmin(request);
    const id = await readId(context);
    const data = courseUpdate.parse(await readBody(request));
    const course = await db.course.update({ where: { id }, data });
    return Response.json({ data: courseJson(course) });
  });
}

export function DELETE(request: Request, context: ItemContext) {
  return endpoint(async () => {
    requireAdmin(request);
    const id = await readId(context);
    await db.course.delete({ where: { id } });
    return new Response(null, { status: 204 });
  });
}
