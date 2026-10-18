import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const availability = sqliteTable("availability", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  interviewerEmail: text("interviewer_email").notNull(),
  department: text("department").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  booked: integer("booked", { mode: "boolean" }).notNull().default(false),
}, (table) => [uniqueIndex("availability_interviewer_start_unique").on(table.interviewerEmail, table.startsAt)]);

export const bookings = sqliteTable("bookings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  availabilityId: integer("availability_id").notNull().references(() => availability.id),
  candidateName: text("candidate_name").notNull(),
  candidateEmail: text("candidate_email").notNull(),
  department: text("department").notNull(),
  preferences: text("preferences").notNull(),
  status: text("status").notNull().default("pending"),
  calendarEventId: text("calendar_event_id"),
  meetUrl: text("meet_url"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("bookings_availability_unique").on(table.availabilityId)]);
