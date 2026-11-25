import { timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// The assignment uses one server-configured admin token until account auth is built.
export function requireAdmin(request: Request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) throw new ApiError(503, "AUTH_NOT_CONFIGURED", "Administrator access is not configured.");
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!supplied) throw new ApiError(401, "UNAUTHORIZED", "A valid administrator bearer token is required.");
  const actualBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new ApiError(401, "UNAUTHORIZED", "A valid administrator bearer token is required.");
  }
}

export function endpoint(handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((error: unknown) => {
    if (error instanceof z.ZodError) {
      return Response.json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed.", details: error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })) } }, { status: 400 });
    }
    if (error instanceof ApiError) {
      const headers = error.status === 401 ? { "WWW-Authenticate": "Bearer" } : undefined;
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return Response.json({ error: { code: "CONFLICT", message: "A course with this code already exists in this syllabus version." } }, { status: 409 });
      }
      if (error.code === "P2025") {
        return Response.json({ error: { code: "NOT_FOUND", message: "The requested record does not exist." } }, { status: 404 });
      }
    }
    console.error("API request failed:", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." } }, { status: 500 });
  });
}

export async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Use Content-Type: application/json.");
  }
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body must contain valid JSON.");
  }
}

export type ItemContext = { params: Promise<{ id: string }> };

export async function readId(context: ItemContext) {
  return z.uuid().parse((await context.params).id);
}

export function readQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in result) throw new ApiError(400, "INVALID_QUERY", "Repeated query parameters are not supported.");
    result[key] = value;
  }
  return result;
}
