# IITMS CRUD API assignment

An API-only implementation of **Course Catalog Management** and **Event Management** from the IIT Management System proposal. There are ten CRUD endpoints, PostgreSQL persistence, request validation, and automated HTTP integration tests. No frontend is included.

## Stack and scope

- Next.js App Router route handlers with TypeScript.
- PostgreSQL with Prisma ORM 7 and its PostgreSQL driver adapter.
- Zod for request validation and Vitest for integration tests.
- Public read endpoints and a temporary administrator bearer token for writes.

The token is an assignment access mechanism, not user login or role management. Account authentication, course offerings, enrollment, resources, event registrations, payments, notifications, and caching are outside this slice.

## Setup

Requirements: Node.js 22.12 or newer and Docker with Docker Compose. Run all commands from this project directory. The development and test databases are separate databases in the same local PostgreSQL container.

```bash
cp .env.example .env
npm install
docker compose up -d --wait database
npm run db:generate
npm run db:migrate
```

`npm install` creates `package-lock.json`; keep that file when reviewing and committing this project. The PostgreSQL initialization script creates `iitms_test` on the first container initialization. The main `iitms` database is created by the PostgreSQL image.

If you already have PostgreSQL on port 5432, either use that instance and create the two databases yourself, or change the Compose host port and both URLs in `.env`. If an existing Docker volume predates the test database initialization script, create only the missing test database:

```bash
docker compose exec database psql -U iitms -d postgres -c 'CREATE DATABASE iitms_test;'
```

Do not run that command if `iitms_test` already exists. Database initialization scripts run only when the volume is first created.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

These checks have to be run locally; their results are not assumed. `npm run typecheck` and `npm test` generate the Prisma client first. Building also generates the client. No database reset is part of these scripts.

`npm test` performs the following automatically:

1. Loads `.env` and requires `TEST_DATABASE_URL` to name a PostgreSQL database ending in `_test`, with a different name from the development database.
2. Applies the committed migration to that test database.
3. Starts an isolated Next.js server on an available loopback port, using `.next-test` and a random test administrator token.
4. Sends real HTTP requests to both collections and their item endpoints.
5. Uses direct SQL reads to check that creation, updates, and deletion reached PostgreSQL.
6. Removes records created by each test and shuts down the test server.

Never point `TEST_DATABASE_URL` at a database containing valuable data. The suite deliberately writes and deletes its own fixtures. It does not truncate tables or drop the database. Run one test invocation at a time because `.next-test` is shared by invocations.

Run just the integration suite with:

```bash
npm run test:integration
```

The suite uses the real framework and database, with no mocked Prisma calls. It needs neither a manually started application server nor Postman. Detailed test scenarios are in [tests/TEST_CASES.md](tests/TEST_CASES.md).

## Running the API manually

```bash
npm run dev
```

The base URL is `http://127.0.0.1:3000`. There is no homepage; use `/api/health`, `/api/courses`, or `/api/events`. The health route is a process liveness check, not a database readiness check.

To run a production build locally after `npm run build`:

```bash
npm start
```

## Endpoints

| Method | Path | Access | Successful response |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | `200` |
| POST | `/api/courses` | Admin token | `201`, resource and `Location` header |
| GET | `/api/courses` | Public | `200`, paginated list |
| GET | `/api/courses/:id` | Public | `200`, resource |
| PATCH | `/api/courses/:id` | Admin token | `200`, updated resource |
| DELETE | `/api/courses/:id` | Admin token | `204`, empty body |
| POST | `/api/events` | Admin token | `201`, resource and `Location` header |
| GET | `/api/events` | Public | `200`, paginated list |
| GET | `/api/events/:id` | Public | `200`, resource |
| PATCH | `/api/events/:id` | Admin token | `200`, updated resource |
| DELETE | `/api/events/:id` | Admin token | `204`, empty body |

For writes, send `Authorization: Bearer <ADMIN_API_TOKEN>` using the token configured in `.env`. POST and PATCH also require `Content-Type: application/json`. PATCH updates only supplied fields and must contain at least one valid field. Unknown body fields are rejected. IDs and timestamps are server-managed.

### Courses

Example create request, using the local example token:

```bash
curl -i http://127.0.0.1:3000/api/courses \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local-iitms-admin-change-me' \
  -d '{"code":"CSE 3102L","title":"Web Technology Lab","credits":1.5,"semester":6,"syllabusVersion":"2024"}'
```

| Field | Rule |
| --- | --- |
| `code` | Required string, 1–20 characters; letters/numbers separated by single spaces or hyphens; trimmed and uppercased |
| `title` | Required nonblank string, at most 150 characters |
| `credits` | JSON number greater than 0 and at most 10, in increments of 0.5 |
| `semester` | JSON integer from 1 through 8 |
| `syllabusVersion` | Required nonblank string, at most 30 characters |

Course code uniqueness is scoped to the syllabus version. The same code in another version is allowed. Uniqueness is enforced by PostgreSQL, including concurrent requests. Syllabus version matching is case-sensitive.

List example:

```bash
curl 'http://127.0.0.1:3000/api/courses?page=1&limit=10&semester=6&syllabusVersion=2024&search=web'
```

Course search matches title or code case-insensitively. Results sort by creation time descending, with ID as a stable tie breaker.

### Events

```bash
curl -i http://127.0.0.1:3000/api/events \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local-iitms-admin-change-me' \
  -d '{"title":"IIT Seminar","description":"A seminar for IIT students.","date":"2030-06-15T10:00:00+06:00","venue":"IIT Auditorium","fee":100.50,"capacity":50}'
```

| Field | Rule |
| --- | --- |
| `title` | Required nonblank string, at most 150 characters |
| `description` | Required nonblank string, at most 5,000 characters |
| `date` | Valid ISO 8601 date-time with `Z` or a numeric timezone offset |
| `venue` | Required nonblank string, at most 200 characters |
| `fee` | JSON number from 0 to 99,999,999.99, at most two decimal places; 0 means free |
| `capacity` | JSON integer from 1 to 2,147,483,647 |

Past dates are allowed so historical events can be recorded. Event titles do not have to be unique. Event search matches title case-insensitively. Results sort by event date ascending, then ID.

```bash
curl 'http://127.0.0.1:3000/api/events?page=1&limit=10&search=seminar'
```

### Response format

A single record is wrapped in `{ "data": { ... } }`. Timestamps are returned as ISO strings in UTC. Decimal database values are returned as strings to preserve precision: course `credits` has one decimal place (for example `"3.0"`), and event `fee` has two (for example `"100.50"`). Requests use JSON numbers for those fields.

Lists contain `data` and pagination metadata:

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
}
```

`page` defaults to 1 and supports values up to 100,000; `limit` defaults to 10 and supports values up to 100. Both must be positive integer strings. Unknown or repeated query parameters are rejected. Pages beyond the available records return an empty `data` array.

### Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{ "field": "semester", "message": "..." }]
  }
}
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid input, invalid UUID, malformed JSON, invalid query, or empty update |
| 401 | Missing or invalid administrator token |
| 404 | Well-formed ID does not identify a record |
| 405 | HTTP method is unsupported; handled by Next.js |
| 409 | Duplicate course code within a syllabus version |
| 415 | POST/PATCH did not use JSON content type |
| 500 | Unexpected server/database error; internals are not returned |
| 503 | Administrator token is not configured for a write request |

Framework-generated responses such as `405` may have an empty body; they do not use the application's JSON error envelope.

## Code map

| Location | Responsibility |
| --- | --- |
| `src/app/api/` | HTTP route handlers for the two resources and health check |
| `src/lib/api.ts` | Shared request parsing, token check, and error responses |
| `src/lib/validation.ts` | Course/event payload and query schemas |
| `src/lib/db.ts` | Shared Prisma client |
| `src/lib/serializers.ts` | Decimal response formatting |
| `prisma/schema.prisma` | Database models |
| `prisma/migrations/` | Initial SQL migration and database constraints |
| `tests/global-setup.ts` | Test database guard, migrations, and isolated server lifecycle |
| `tests/integration/crud.test.ts` | Automated HTTP CRUD and error scenarios |

The SQL migration also adds credit, semester, fee, and capacity check constraints; preserve these in future migrations because Prisma's model syntax does not represent them.

Implementation references: [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Prisma 7 configuration and driver adapters](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), and [Vitest global setup](https://vitest.dev/config/globalsetup).
