# Integration test cases

Implementation: `tests/integration/crud.test.ts` and `tests/integration/reports.test.ts`. Run with `npm test` after the setup steps in the root README. These scenarios are automated against actual HTTP endpoints and a PostgreSQL test database. This document describes expected results, not a claim that execution has passed.

## Anonymous report cases

| Case | Action | Expected result |
| --- | --- | --- |
| Anonymous submission | POST title and description without a token | 201; response has ID and NEW status but no report text; database row has no author or user ID |
| Administrator boundary | GET list/item and PATCH item without admin token | 401; report contents stay hidden |
| Review workflow | Move NEW to UNDER_REVIEW to RESOLVED; filter list by status | 200; matching report and persisted status |
| Invalid transitions | Skip review, repeat a status, or reopen a terminal report | 409 |
| Concurrent reviewers | Send two status changes at once | One 200 and one 409 |
| Invalid input | Blank or unexpected submission fields, invalid status body, invalid list parameters | 400 |
| Unknown report | GET a nonexistent UUID as admin | 404 |

## Cases exercised for both courses and events

| Case | Action | Expected result |
| --- | --- | --- |
| Full lifecycle | POST → GET item → GET list → PATCH → GET item → DELETE → GET item | 201 → 200 → 200 → 200 → 200 → 204 → 404; created and updated fields persist in PostgreSQL; deleted row is absent |
| Creation metadata | Create a record | Server-generated ID, timestamp, and correct Location header |
| Public reads | Read a record without an admin token | 200 |
| Pagination and search | Create two matching records; request page 1 and page 2 with limit 1 and lowercase search | Correct total and page metadata; one distinct matching record per page |
| No matching records | Search for a unique nonexistent value | 200; empty array, total 0, totalPages 0 |
| Missing token | POST, PATCH and DELETE without authorization | 401 and WWW-Authenticate header; existing record remains unchanged |
| Invalid token | POST, PATCH and DELETE with an incorrect token | 401; existing record remains unchanged |
| Unknown UUID | GET, PATCH and DELETE with a valid nonexistent UUID | 404 and NOT_FOUND error code |
| Invalid UUID | GET, PATCH and DELETE using bad-id | 400 and VALIDATION_ERROR error code |
| Invalid updates | PATCH with an empty object, blank title, unknown field, or null title | 400; original record remains unchanged |
| Invalid creation shape | POST with an empty object, array, null or incomplete object | 400 |
| Malformed JSON | POST with truncated JSON | 400 and INVALID_JSON error code |
| Unsupported content type | POST with text/plain | 415 |
| Invalid query | Zero/fractional/nonnumeric page; blank/oversized limit; repeated/unknown parameters | 400 |
| Unsupported method | PUT to an item endpoint | 405 |

## Course-specific cases

| Case | Action | Expected result |
| --- | --- | --- |
| Normalization | Create with lowercase code and surrounding whitespace | Uppercase trimmed code and trimmed title |
| Duplicate course | Repeat the same code and syllabus version using different code casing | 409 and CONFLICT error code |
| Versioned catalog | Create the same code in two syllabus versions | Both succeed with 201 |
| Conflicting update | PATCH another course to an existing code in the same version | 409; original record unchanged |
| Concurrent duplicates | Send two simultaneous identical POST requests | Exactly one 201 and one 409 |
| Catalog filtering | Filter by syllabus version and semester | Only matching records and correct total |
| Invalid semesters | Create/update with 0, 9 or 1.5 | 400 |
| Invalid credits | Create/update with 0, 10.5, 3.25 or a numeric string | 400 |
| Invalid text | Create/update with invalid code characters, blank title or empty syllabus version | 400 |
| Server-owned ID | Supply an id in POST or PATCH | 400 |

## Event-specific cases

| Case | Action | Expected result |
| --- | --- | --- |
| Free event | Create with fee 0 | 201; fee is returned as "0.00" |
| Timezone conversion | Submit 2030-06-15T10:00:00+06:00 | Returned date is 2030-06-15T04:00:00.000Z |
| Invalid fee | Create/update with negative, excessive, overly precise or string fee | 400 |
| Invalid capacity | Create/update with zero, negative, fractional or out-of-range capacity | 400 |
| Invalid date | Create/update with invalid text, impossible calendar date or missing timezone | 400 |
| Invalid text | Create/update with blank venue, empty description or title over 150 characters | 400 |
| Server-owned ID | Supply an id in POST or PATCH | 400 |

## Short demonstration for the assignment

1. Show the two models and the five CRUD routes for each resource.
2. Explain how Zod validation, the database unique constraint, and error mapping work.
3. Run `npm test` and show the integration test results.
4. Open the lifecycle test to show the same create/read/update/delete work normally done manually in Postman.
5. Point out direct SQL persistence assertions and the separate test database.
