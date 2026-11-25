import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, inject, test } from "vitest";

const ids = new Set<string>();
let database: Pool;

beforeAll(() => {
  database = new Pool({ connectionString: inject("databaseUrl"), connectionTimeoutMillis: 5000 });
});

afterEach(async () => {
  await database.query('DELETE FROM "AnonymousReport" WHERE "id" = ANY($1::uuid[])', [[...ids]]);
  ids.clear();
});

afterAll(async () => {
  await database?.end();
});

async function request(path: string, options: {
  method?: string;
  body?: unknown;
  admin?: boolean;
  headers?: Record<string, string>;
} = {}) {
  const response = await fetch(`${inject("baseUrl")}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.admin ? { Authorization: `Bearer ${inject("adminToken")}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(55000),
  });
  const json = await response.json();
  if (response.status === 201 && json?.data?.id) ids.add(json.data.id);
  return { response, json };
}

async function submit() {
  const input = { title: `Concern ${randomUUID()}`, description: "A private report for the administrator." };
  const result = await request("/api/reports", { method: "POST", body: input });
  expect(result.response.status, JSON.stringify(result.json)).toBe(201);
  return { input, ...result };
}

describe("anonymous reports", () => {
  test("submits without an account link and hides content from the submit response", async () => {
    const { input, response, json } = await submit();
    expect(json.data).toEqual({ id: expect.any(String), status: "NEW" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    const saved = await database.query('SELECT * FROM "AnonymousReport" WHERE "id" = $1', [json.data.id]);
    expect(saved.rows[0]).toMatchObject(input);
    expect(saved.rows[0].status).toBe("NEW");
    expect(saved.rows[0]).not.toHaveProperty("authorId");
    expect(saved.rows[0]).not.toHaveProperty("userId");
  });

  test("only administrators can list, view, and update reports", async () => {
    const { json } = await submit();
    for (const [method, path] of [
      ["GET", "/api/reports"],
      ["GET", `/api/reports/${json.data.id}`],
      ["PATCH", `/api/reports/${json.data.id}`],
    ]) {
      const denied = await request(path, { method, ...(method === "PATCH" ? { body: { status: "UNDER_REVIEW" } } : {}) });
      expect(denied.response.status).toBe(401);
      expect(JSON.stringify(denied.json)).not.toContain("private report");
    }
    const detail = await request(`/api/reports/${json.data.id}`, { admin: true });
    expect(detail.response.status).toBe(200);
    expect(detail.json.data.description).toBe("A private report for the administrator.");
    expect(detail.response.headers.get("cache-control")).toContain("no-store");
  });

  test("reviews then resolves a report and filters the administrator list", async () => {
    const { json } = await submit();
    const id = json.data.id;
    const review = await request(`/api/reports/${id}`, { method: "PATCH", admin: true, body: { status: "UNDER_REVIEW" } });
    expect(review.response.status).toBe(200);
    expect(review.json.data.status).toBe("UNDER_REVIEW");
    const resolved = await request(`/api/reports/${id}`, { method: "PATCH", admin: true, body: { status: "RESOLVED" } });
    expect(resolved.response.status).toBe(200);
    const listed = await request("/api/reports?status=RESOLVED&page=1&limit=1", { admin: true });
    expect(listed.response.status).toBe(200);
    expect(listed.json.data).toEqual([expect.objectContaining({ id, status: "RESOLVED" })]);
    expect(listed.json.pagination).toMatchObject({ page: 1, limit: 1 });
    expect(listed.response.headers.get("cache-control")).toContain("no-store");
    const saved = await database.query('SELECT "status" FROM "AnonymousReport" WHERE "id" = $1', [id]);
    expect(saved.rows[0].status).toBe("RESOLVED");
  });

  test("rejects skipped, repeated, and terminal status transitions", async () => {
    const { json } = await submit();
    const id = json.data.id;
    for (const status of ["RESOLVED", "DISMISSED", "NEW"]) {
      const invalid = await request(`/api/reports/${id}`, { method: "PATCH", admin: true, body: { status } });
      expect(invalid.response.status).toBe(409);
      expect(invalid.json.error.code).toBe("INVALID_TRANSITION");
    }
    expect((await request(`/api/reports/${id}`, { method: "PATCH", admin: true, body: { status: "UNDER_REVIEW" } })).response.status).toBe(200);
    expect((await request(`/api/reports/${id}`, { method: "PATCH", admin: true, body: { status: "DISMISSED" } })).response.status).toBe(200);
    expect((await request(`/api/reports/${id}`, { method: "PATCH", admin: true, body: { status: "UNDER_REVIEW" } })).response.status).toBe(409);
  });

  test("allows only one concurrent reviewer to change the same status", async () => {
    const { json } = await submit();
    const results = await Promise.all([
      request(`/api/reports/${json.data.id}`, { method: "PATCH", admin: true, body: { status: "UNDER_REVIEW" } }),
      request(`/api/reports/${json.data.id}`, { method: "PATCH", admin: true, body: { status: "UNDER_REVIEW" } }),
    ]);
    expect(results.map(result => result.response.status).sort()).toEqual([200, 409]);
  });

  test("rejects invalid bodies and query parameters", async () => {
    for (const body of [{ title: " ", description: "x" }, { title: "x", description: " " }, { title: "x", description: "x", userId: randomUUID() }]) {
      expect((await request("/api/reports", { method: "POST", body })).response.status).toBe(400);
    }
    const { json } = await submit();
    for (const body of [{ status: "NEW", extra: true }, { status: "UNKNOWN" }, {}]) {
      expect((await request(`/api/reports/${json.data.id}`, { method: "PATCH", admin: true, body })).response.status).toBe(400);
    }
    expect((await request("/api/reports?status=UNKNOWN", { admin: true })).response.status).toBe(400);
    expect((await request("/api/reports?page=0", { admin: true })).response.status).toBe(400);
    expect((await request(`/api/reports/${randomUUID()}`, { admin: true })).response.status).toBe(404);
  });
});
