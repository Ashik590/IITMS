import { ApiError, endpoint, type ItemContext, readBody, readId, requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";
import { eventJson } from "@/lib/serializers";
import { eventUpdate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, context: ItemContext) {
  return endpoint(async () => {
    const id = await readId(context);
    const event = await db.event.findUnique({ where: { id } });
    if (!event) throw new ApiError(404, "NOT_FOUND", "The requested event does not exist.");
    return Response.json({ data: eventJson(event) });
  });
}

export function PATCH(request: Request, context: ItemContext) {
  return endpoint(async () => {
    requireAdmin(request);
    const id = await readId(context);
    const data = eventUpdate.parse(await readBody(request));
    const event = await db.event.update({ where: { id }, data });
    return Response.json({ data: eventJson(event) });
  });
}

export function DELETE(request: Request, context: ItemContext) {
  return endpoint(async () => {
    requireAdmin(request);
    const id = await readId(context);
    await db.event.delete({ where: { id } });
    return new Response(null, { status: 204 });
  });
}
