import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  test,
} from "vitest";

const ids = { courses: new Set<string>(), events: new Set<string>() };
let database: Pool;

beforeAll(() => {
  database = new Pool({
    connectionString: inject("databaseUrl"),
    connectionTimeoutMillis: 5000,
  });
});

afterEach(async () => {
  // Remove only records created by this test, preserving any other test DB data.
  await database.query('DELETE FROM "Course" WHERE "id" = ANY($1::uuid[])', [
    [...ids.courses],
  ]);
  await database.query('DELETE FROM "Event" WHERE "id" = ANY($1::uuid[])', [
    [...ids.events],
  ]);
  ids.courses.clear();
  ids.events.clear();
});

afterAll(async () => {
  await database?.end();
});

type Options = {
  method?: string;
  body?: unknown;
  rawBody?: string;
  token?: string | null;
  headers?: Record<string, string>;
};

async function request(path: string, options: Options = {}) {
  const {
    method = "GET",
    body,
    rawBody,
    token = inject("adminToken"),
    headers = {},
  } = options;
  const response = await fetch(`${inject("baseUrl")}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    signal: AbortSignal.timeout(55000),
  });
  const json = response.status === 204 ? null : await response.json();
  const collection = path.split("?")[0].split("/")[2];
  if (
    response.status === 201 &&
    json?.data?.id &&
    (collection === "courses" || collection === "events")
  ) {
    ids[collection].add(json.data.id);
  }
  return { response, json };
}

function course() {
  return {
    code: `T${randomUUID().slice(0, 8).toUpperCase()}`,
    title: "Web Technology",
    credits: 3,
    semester: 6,
    syllabusVersion: `test-${randomUUID().slice(0, 8)}`,
  };
}

function event() {
  return {
    title: `Seminar ${randomUUID()}`,
    description: "A seminar for IIT students.",
    date: "2030-06-15T10:00:00+06:00",
    venue: "IIT Auditorium",
    fee: 100.5,
    capacity: 50,
  };
}

async function create(resource: string, body: unknown) {
  const result = await request(`/api/${resource}`, { method: "POST", body });
  expect(result.response.status, JSON.stringify(result.json)).toBe(201);
  return result;
}

const features = [
  {
    resource: "courses",
    table: "Course",
    fixture: course,
    update: { title: "Advanced Web Technology", credits: 3.5 },
    decimalField: "credits",
    decimalValue: "3.0",
    updatedDecimal: "3.5",
  },
  {
    resource: "events",
    table: "Event",
    fixture: event,
    update: { title: "Updated IIT Seminar", fee: 125.75 },
    decimalField: "fee",
    decimalValue: "100.50",
    updatedDecimal: "125.75",
  },
] as const;

describe.each(features)("$resource CRUD integration", (feature) => {
  const {
    resource,
    table,
    fixture,
    update,
    decimalField,
    decimalValue,
    updatedDecimal,
  } = feature;

  test("complete lifecycle persists create and update, then deletes the record", async () => {
    const input = fixture();
    const created = await create(resource, input);
    const id = created.json.data.id;
    expect(created.response.headers.get("location")).toBe(
      `/api/${resource}/${id}`,
    );
    expect(created.json.data).toMatchObject({
      title: input.title,
      [decimalField]: decimalValue,
    });
    expect(created.json.data.createdAt).toEqual(expect.any(String));
    const inserted = await database.query(
      `SELECT * FROM "${table}" WHERE "id" = $1`,
      [id],
    );
    expect(inserted.rows[0].title).toBe(input.title);

    const read = await request(`/api/${resource}/${id}`, { token: null });
    expect(read.response.status).toBe(200);
    expect(read.json.data).toEqual(created.json.data);

    const listed = await request(
      `/api/${resource}?search=${encodeURIComponent(input.title)}`,
      { token: null },
    );
    expect(listed.response.status).toBe(200);
    expect(listed.json.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );

    const patched = await request(`/api/${resource}/${id}`, {
      method: "PATCH",
      body: update,
    });
    expect(patched.response.status).toBe(200);
    expect(patched.json.data).toMatchObject({
      id,
      title: update.title,
      [decimalField]: updatedDecimal,
    });
    const updated = await database.query(
      `SELECT * FROM "${table}" WHERE "id" = $1`,
      [id],
    );
    expect(updated.rows[0].title).toBe(update.title);
    expect(updated.rows[0][decimalField]).toBe(updatedDecimal);
    const reread = await request(`/api/${resource}/${id}`);
    expect(reread.json.data.title).toBe(update.title);

    const removed = await request(`/api/${resource}/${id}`, {
      method: "DELETE",
    });
    expect(removed.response.status).toBe(204);
    expect(removed.json).toBeNull();
    expect((await request(`/api/${resource}/${id}`)).response.status).toBe(404);
    expect(
      (
        await database.query(`SELECT "id" FROM "${table}" WHERE "id" = $1`, [
          id,
        ])
      ).rowCount,
    ).toBe(0);
  });

  test("supports pagination and case-insensitive search", async () => {
    const marker = `Group${randomUUID().slice(0, 8)}`;
    const first = await create(resource, {
      ...fixture(),
      title: `${marker} One`,
    });
    const second = await create(resource, {
      ...fixture(),
      title: `${marker} Two`,
    });
    const page1 = await request(
      `/api/${resource}?search=${marker.toLowerCase()}&page=1&limit=1`,
    );
    const page2 = await request(
      `/api/${resource}?search=${marker.toLowerCase()}&page=2&limit=1`,
    );
    expect(page1.response.status).toBe(200);
    expect(page2.response.status).toBe(200);
    expect(page1.json.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(page2.json.pagination.page).toBe(2);
    expect(new Set([page1.json.data[0].id, page2.json.data[0].id])).toEqual(
      new Set([first.json.data.id, second.json.data.id]),
    );
  });

  test("returns an empty list and zero total pages when nothing matches", async () => {
    const result = await request(`/api/${resource}?search=${randomUUID()}`);
    expect(result.response.status).toBe(200);
    expect(result.json).toEqual({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  });

  test.each([null, "invalid-token"])(
    "rejects writes with token %s without modifying data",
    async (token) => {
      const created = await create(resource, fixture());
      const id = created.json.data.id;
      const attempts = [
        await request(`/api/${resource}`, {
          method: "POST",
          body: fixture(),
          token,
        }),
        await request(`/api/${resource}/${id}`, {
          method: "PATCH",
          body: update,
          token,
        }),
        await request(`/api/${resource}/${id}`, { method: "DELETE", token }),
      ];
      for (const attempt of attempts) {
        expect(attempt.response.status).toBe(401);
        expect(attempt.response.headers.get("www-authenticate")).toBe("Bearer");
      }
      expect((await request(`/api/${resource}/${id}`)).json.data).toEqual(
        created.json.data,
      );
    },
  );

  test.each(["GET", "PATCH", "DELETE"])(
    "returns 404 for %s on an unknown UUID",
    async (method) => {
      const result = await request(`/api/${resource}/${randomUUID()}`, {
        method,
        ...(method === "PATCH" ? { body: update } : {}),
      });
      expect(result.response.status).toBe(404);
      expect(result.json.error.code).toBe("NOT_FOUND");
    },
  );

  test.each(["GET", "PATCH", "DELETE"])(
    "returns 400 for %s on an invalid UUID",
    async (method) => {
      const result = await request(`/api/${resource}/bad-id`, {
        method,
        ...(method === "PATCH" ? { body: update } : {}),
      });
      expect(result.response.status).toBe(400);
      expect(result.json.error.code).toBe("VALIDATION_ERROR");
    },
  );

  test.each([
    {},
    { title: " " },
    { unexpectedField: "value" },
    { title: null },
  ])(
    "rejects invalid PATCH payload %j and preserves the record",
    async (body) => {
      const created = await create(resource, fixture());
      const id = created.json.data.id;
      const result = await request(`/api/${resource}/${id}`, {
        method: "PATCH",
        body,
      });
      expect(result.response.status).toBe(400);
      expect((await request(`/api/${resource}/${id}`)).json.data).toEqual(
        created.json.data,
      );
    },
  );

  test.each([{}, [], null, { title: "Only title" }])(
    "rejects incomplete or non-object POST payload %j",
    async (body) => {
      const result = await request(`/api/${resource}`, {
        method: "POST",
        body,
      });
      expect(result.response.status).toBe(400);
    },
  );

  test("rejects malformed JSON", async () => {
    const result = await request(`/api/${resource}`, {
      method: "POST",
      rawBody: '{"title":',
    });
    expect(result.response.status).toBe(400);
    expect(result.json.error.code).toBe("INVALID_JSON");
  });

  test("rejects unsupported content types", async () => {
    const result = await request(`/api/${resource}`, {
      method: "POST",
      body: fixture(),
      headers: { "Content-Type": "text/plain" },
    });
    expect(result.response.status).toBe(415);
  });

  test.each([
    "page=0",
    "page=1.5",
    "limit=101",
    "limit=",
    "page=abc",
    "page=1&page=2",
    "unknown=value",
  ])("rejects invalid query %s", async (query) => {
    expect((await request(`/api/${resource}?${query}`)).response.status).toBe(
      400,
    );
  });

  test("returns 405 for unsupported PUT requests", async () => {
    const result = await fetch(
      `${inject("baseUrl")}/api/${resource}/${randomUUID()}`,
      { method: "PUT" },
    );
    expect(result.status).toBe(405);
  });
});

describe("course rules", () => {
  test("normalizes course codes and trims text", async () => {
    const input = course();
    const result = await create("courses", {
      ...input,
      code: ` ${input.code.toLowerCase()} `,
      title: " Web Technology ",
    });
    expect(result.json.data.code).toBe(input.code);
    expect(result.json.data.title).toBe("Web Technology");
  });

  test("rejects duplicate normalized codes within a syllabus version", async () => {
    const input = course();
    await create("courses", input);
    const duplicate = await request("/api/courses", {
      method: "POST",
      body: { ...input, code: input.code.toLowerCase() },
    });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.json.error.code).toBe("CONFLICT");
  });

  test("allows the same course code in another syllabus version", async () => {
    const input = course();
    await create("courses", input);
    await create("courses", {
      ...input,
      syllabusVersion: `${input.syllabusVersion}-other`,
    });
  });

  test("rejects a conflicting update without altering the original record", async () => {
    const input = course();
    await create("courses", input);
    const second = await create("courses", {
      ...course(),
      syllabusVersion: input.syllabusVersion,
    });
    const id = second.json.data.id;
    const result = await request(`/api/courses/${id}`, {
      method: "PATCH",
      body: { code: input.code },
    });
    expect(result.response.status).toBe(409);
    expect((await request(`/api/courses/${id}`)).json.data).toEqual(
      second.json.data,
    );
  });

  test("handles concurrent duplicate creations with one success and one conflict", async () => {
    const input = course();
    const results = await Promise.all([
      request("/api/courses", { method: "POST", body: input }),
      request("/api/courses", { method: "POST", body: input }),
    ]);
    expect(results.map((result) => result.response.status).sort()).toEqual([
      201, 409,
    ]);
  });

  test("filters courses by syllabus version and semester", async () => {
    const input = course();
    const matching = await create("courses", input);
    await create("courses", {
      ...course(),
      syllabusVersion: input.syllabusVersion,
      semester: 4,
    });
    await create("courses", { ...course(), semester: input.semester });
    const result = await request(
      `/api/courses?semester=6&syllabusVersion=${input.syllabusVersion}`,
    );
    expect(result.response.status).toBe(200);
    expect(result.json.data.map((row: { id: string }) => row.id)).toEqual([
      matching.json.data.id,
    ]);
    expect(result.json.pagination.total).toBe(1);
  });

  test.each([
    { semester: 0 },
    { semester: 9 },
    { semester: 1.5 },
    { credits: 0 },
    { credits: 10.5 },
    { credits: 3.25 },
    { credits: "3" },
    { code: "!invalid" },
    { title: " " },
    { syllabusVersion: "" },
    { id: randomUUID() },
  ])(
    "rejects invalid course fields %j on create and update",
    async (invalid) => {
      const created = await create("courses", course());
      expect(
        (
          await request("/api/courses", {
            method: "POST",
            body: { ...course(), ...invalid },
          })
        ).response.status,
      ).toBe(400);
      expect(
        (
          await request(`/api/courses/${created.json.data.id}`, {
            method: "PATCH",
            body: invalid,
          })
        ).response.status,
      ).toBe(400);
    },
  );
});

describe("event rules", () => {
  test("allows free events and normalizes dates to UTC", async () => {
    const result = await create("events", { ...event(), fee: 0 });
    expect(result.json.data.fee).toBe("0.00");
    expect(result.json.data.date).toBe("2030-06-15T04:00:00.000Z");
  });

  test.each([
    { fee: -1 },
    { fee: 0.001 },
    { fee: 100000000 },
    { fee: "100" },
    { capacity: 0 },
    { capacity: -1 },
    { capacity: 1.5 },
    { capacity: 2147483648 },
    { date: "not-a-date" },
    { date: "2030-02-30T10:00:00Z" },
    { date: "2030-06-15T10:00:00" },
    { venue: " " },
    { description: "" },
    { title: "x".repeat(151) },
    { id: randomUUID() },
  ])(
    "rejects invalid event fields %j on create and update",
    async (invalid) => {
      const created = await create("events", event());
      expect(
        (
          await request("/api/events", {
            method: "POST",
            body: { ...event(), ...invalid },
          })
        ).response.status,
      ).toBe(400);
      expect(
        (
          await request(`/api/events/${created.json.data.id}`, {
            method: "PATCH",
            body: invalid,
          })
        ).response.status,
      ).toBe(400);
    },
  );
});
