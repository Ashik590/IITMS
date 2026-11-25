import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);

export const courseCreate = z.object({
  code: text(20).regex(/^[A-Za-z0-9]+(?:[ -][A-Za-z0-9]+)*$/, "Use letters, numbers, single spaces or hyphens.").transform(value => value.toUpperCase()),
  title: text(150),
  credits: z.number().positive().max(10).multipleOf(0.5),
  semester: z.number().int().min(1).max(8),
  syllabusVersion: text(30),
}).strict();

export const courseUpdate = courseCreate.partial().refine(value => Object.keys(value).length > 0, "Provide at least one field to update.");

export const eventCreate = z.object({
  title: text(150),
  description: text(5000),
  date: z.iso.datetime({ offset: true }).transform(value => new Date(value)),
  venue: text(200),
  fee: z.number().min(0).max(99999999.99).multipleOf(0.01),
  capacity: z.number().int().min(1).max(2147483647),
}).strict();

export const eventUpdate = eventCreate.partial().refine(value => Object.keys(value).length > 0, "Provide at least one field to update.");

// Require decimal integer strings: reject blanks, fractions and scientific notation.
const queryInteger = (max: number) => z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(max));
const pagination = {
  page: queryInteger(100000).default(1),
  limit: queryInteger(100).default(10),
  search: text(150).optional(),
};

export const courseQuery = z.object({
  ...pagination,
  semester: queryInteger(8).optional(),
  syllabusVersion: text(30).optional(),
}).strict();

export const eventQuery = z.object(pagination).strict();

export const reportCreate = z.object({
  title: text(150),
  description: text(5000),
}).strict();

export const reportStatus = z.enum(["NEW", "UNDER_REVIEW", "RESOLVED", "DISMISSED"]);

export const reportQuery = z.object({
  page: pagination.page,
  limit: pagination.limit,
  status: reportStatus.optional(),
}).strict();

export const reportStatusUpdate = z.object({ status: reportStatus }).strict();
