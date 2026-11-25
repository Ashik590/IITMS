import type { Course, Event } from "@/generated/prisma/client";

export const courseJson = (course: Course) => ({ ...course, credits: course.credits.toFixed(1) });
export const eventJson = (event: Event) => ({ ...event, fee: event.fee.toFixed(2) });
