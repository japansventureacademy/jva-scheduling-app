import { env } from "cloudflare:workers";
import { CalendarSyncError, deleteCalendarEvent, ensureCalendarEvent } from "@/lib/google-calendar";
import { isStaffGateOpen } from "@/lib/staff-gate";
import { isSameOriginRequest, privateJson, readJson, RequestBodyError } from "@/lib/http-security";
import { presidentEmail, staffEmailFromRequest, staffForEmail } from "@/lib/staff";
const DEPARTMENTS = ["Partnership", "Marketing", "Lab"];

export async function GET(request: Request) {
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const email = staffEmailFromRequest(request);
  const staff = staffForEmail(email);
  if (!staff) return privateJson({ error: "Choose a valid interviewer profile" }, { status: 403 });

  // Candidate email is intentionally omitted. Staff only receive records they
  // are responsible for; filtering in the browser would still disclose data.
  const baseQuery = "SELECT b.id, b.candidate_name AS candidateName, b.department, b.status, b.meet_url AS meetUrl, a.starts_at AS startsAt, a.ends_at AS endsAt, CASE WHEN a.interviewer_email = ? THEN 1 ELSE 0 END AS assignedToRequester FROM bookings b JOIN availability a ON a.id = b.availability_id";
  const result = staff.department === "All"
    ? await env.DB.prepare(`${baseQuery} WHERE a.interviewer_email = ? OR b.status = 'deferred' ORDER BY a.starts_at`).bind(email, email).all()
    : await env.DB.prepare(`${baseQuery} WHERE b.department = ? ORDER BY a.starts_at`).bind(email, staff.department).all();
  return privateJson({ bookings: result.results });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return privateJson({ error: "Cross-site requests are not allowed" }, { status: 403 });
  try {
    const body = await readJson<{ availabilityId?: unknown; candidateName?: unknown; candidateEmail?: unknown; department?: unknown; preferences?: unknown; timelineAcknowledged?: unknown }>(request);
    const id = Number(body.availabilityId);
    const name = typeof body.candidateName === "string" ? body.candidateName.trim().replace(/\s+/g, " ") : "";
    const email = typeof body.candidateEmail === "string" ? body.candidateEmail.trim().toLowerCase() : "";
    const department = typeof body.department === "string" ? body.department.trim() : "";
    const preferences = Array.isArray(body.preferences) ? body.preferences : [];
    const validPreferences = preferences.length >= 1 && preferences.length <= 3 && preferences.every(value => typeof value === "string" && DEPARTMENTS.includes(value)) && new Set(preferences).size === preferences.length && preferences[0] === department;
    const validName = name.length >= 1 && name.length <= 100 && !/[\u0000-\u001f\u007f]/.test(name);
    const validEmail = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!Number.isInteger(id) || id <= 0 || !validName || !validEmail || !DEPARTMENTS.includes(department) || !validPreferences || body.timelineAcknowledged !== true) {
      return privateJson({ error: "Please provide valid details and confirm the recruitment timeline" }, { status: 400 });
    }

    const selected = await env.DB.prepare("SELECT interviewer_email AS interviewerEmail, starts_at AS startsAt, ends_at AS endsAt FROM availability WHERE id = ? AND department = ? AND booked = 0").bind(id, department).first<{ interviewerEmail: string; startsAt: string; endsAt: string }>();
    if (!selected) return privateJson({ error: "This slot is unavailable. Please choose another." }, { status: 409 });
    const results = await env.DB.batch([
      env.DB.prepare("INSERT INTO bookings (availability_id, candidate_name, candidate_email, department, preferences, status, timeline_acknowledged_at) SELECT id, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP FROM availability WHERE id = ? AND department = ? AND booked = 0 AND NOT EXISTS (SELECT 1 FROM bookings existing JOIN availability occupied ON occupied.id = existing.availability_id WHERE existing.candidate_email = ? AND existing.status IN ('pending', 'deferred', 'accepted'))").bind(name, email, department, JSON.stringify(preferences), id, department, email),
      env.DB.prepare("UPDATE availability SET booked = 1 WHERE id = ? AND department = ? AND booked = 0 AND EXISTS (SELECT 1 FROM bookings WHERE availability_id = ? AND candidate_email = ?)").bind(id, department, id, email),
      env.DB.prepare("DELETE FROM availability WHERE booked = 0 AND id <> ? AND interviewer_email = ? AND starts_at < ? AND ends_at > ? AND EXISTS (SELECT 1 FROM availability chosen WHERE chosen.id = ? AND chosen.booked = 1)").bind(id, selected.interviewerEmail, selected.endsAt, selected.startsAt, id),
    ]);
    if ((results[0].meta?.changes ?? 0) !== 1) return privateJson({ error: "This slot is unavailable. Please choose another." }, { status: 409 });
    const booked = await env.DB.prepare("SELECT b.id, a.starts_at AS startsAt, a.ends_at AS endsAt FROM bookings b JOIN availability a ON a.id = b.availability_id WHERE b.availability_id = ?").bind(id).first();
    if (!booked) return privateJson({ error: "This slot is unavailable. Please choose another." }, { status: 409 });
    return privateJson({ status: "success", booking: booked }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: error.message }, { status: error.status });
    return privateJson({ error: "Unable to create booking" }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return privateJson({ error: "Cross-site requests are not allowed" }, { status: 403 });
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const email = staffEmailFromRequest(request);
  const staff = staffForEmail(email);
  if (!staff) return privateJson({ error: "Choose a valid interviewer profile" }, { status: 403 });

  let body: { bookingId?: unknown; action?: unknown };
  try {
    body = await readJson(request, 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: error.message }, { status: error.status });
    return privateJson({ error: "Unable to process request" }, { status: 400 });
  }
  const bookingId = Number(body.bookingId);
  const action = typeof body.action === "string" ? body.action : "";
  if (!Number.isInteger(bookingId) || bookingId <= 0 || !["accept", "defer", "deny", "cover", "sync"].includes(action)) return privateJson({ error: "Invalid decision" }, { status: 400 });

  const booking = await env.DB.prepare("SELECT b.id, b.status, b.department, b.availability_id AS availabilityId, b.candidate_email AS candidateEmail, b.candidate_name AS candidateName, b.calendar_event_id AS calendarEventId, b.meet_url AS meetUrl, a.starts_at AS startsAt, a.ends_at AS endsAt, a.interviewer_email AS interviewerEmail FROM bookings b JOIN availability a ON a.id = b.availability_id WHERE b.id = ?").bind(bookingId).first<{ id: number; status: string; department: string; availabilityId: number; candidateEmail: string; candidateName: string; calendarEventId: string | null; meetUrl: string | null; startsAt: string; endsAt: string; interviewerEmail: string }>();
  if (!booking) return privateJson({ error: "Interview request not found" }, { status: 404 });
  const syncCalendar = async (interviewerEmail: string) => {
    const interviewer = staffForEmail(interviewerEmail);
    if (!interviewer) throw new CalendarSyncError("Choose a valid interviewer profile", 403);
    return ensureCalendarEvent({
      id: booking.id,
      candidateEmail: booking.candidateEmail,
      candidateName: booking.candidateName,
      department: booking.department,
      endsAt: booking.endsAt,
      interviewerEmail,
      interviewerName: interviewer.name,
      startsAt: booking.startsAt,
    });
  };
  if (action === "sync") {
    if (!["accepted", "syncing"].includes(booking.status)) return privateJson({ error: "Only accepted interviews can be synchronized" }, { status: 409 });
    if (staff.department !== "All" && staff.department !== booking.department) return privateJson({ error: "Only the assigned team can synchronize this interview" }, { status: 403 });
    try {
      const calendar = await syncCalendar(booking.interviewerEmail);
      await env.DB.prepare("UPDATE bookings SET status = 'accepted', calendar_event_id = ?, meet_url = ? WHERE id = ? AND status IN ('accepted', 'syncing')").bind(calendar.calendarEventId, calendar.meetUrl, booking.id).run();
      return privateJson({ status: "accepted", meetUrl: calendar.meetUrl });
    } catch (error) {
      if (error instanceof CalendarSyncError) return privateJson({ error: error.message, code: "calendar_sync" }, { status: error.status });
      return privateJson({ error: "Unable to synchronize Google Calendar", code: "calendar_sync" }, { status: 502 });
    }
  }
  if (email === presidentEmail()) {
    if (action !== "cover" || booking.status !== "deferred") return privateJson({ error: "The president can cover deferred requests only" }, { status: 409 });
    const conflict = await env.DB.prepare("SELECT 1 FROM availability WHERE interviewer_email = ? AND booked = 1 AND id <> ? AND starts_at < ? AND ends_at > ? LIMIT 1").bind(email, booking.availabilityId, booking.endsAt, booking.startsAt).first();
    if (conflict) return privateJson({ error: "This interview overlaps another interview on the president's schedule" }, { status: 409 });
    try {
      const claimed = await env.DB.batch([
        env.DB.prepare("UPDATE availability SET interviewer_email = ? WHERE id = ? AND EXISTS (SELECT 1 FROM bookings WHERE id = ? AND status = 'deferred') AND NOT EXISTS (SELECT 1 FROM availability busy WHERE busy.interviewer_email = ? AND busy.booked = 1 AND busy.id <> ? AND busy.starts_at < ? AND busy.ends_at > ?)").bind(email, booking.availabilityId, bookingId, email, booking.availabilityId, booking.endsAt, booking.startsAt),
        env.DB.prepare("UPDATE bookings SET status = 'syncing' WHERE id = ? AND status = 'deferred' AND EXISTS (SELECT 1 FROM availability WHERE id = ? AND interviewer_email = ?)").bind(bookingId, booking.availabilityId, email),
      ]);
      if ((claimed[0].meta?.changes ?? 0) !== 1 || (claimed[1].meta?.changes ?? 0) !== 1) return privateJson({ error: "The president's schedule changed. Refresh and try again." }, { status: 409 });
      const calendar = await syncCalendar(email);
      await env.DB.prepare("UPDATE bookings SET status = 'accepted', calendar_event_id = ?, meet_url = ? WHERE id = ? AND status = 'syncing'").bind(calendar.calendarEventId, calendar.meetUrl, bookingId).run();
      return privateJson({ status: "accepted", meetUrl: calendar.meetUrl });
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare("UPDATE availability SET interviewer_email = ? WHERE id = ? AND interviewer_email = ? AND EXISTS (SELECT 1 FROM bookings WHERE id = ? AND status = 'syncing')").bind(booking.interviewerEmail, booking.availabilityId, email, bookingId),
        env.DB.prepare("UPDATE bookings SET status = 'deferred' WHERE id = ? AND status = 'syncing'").bind(bookingId),
      ]);
      if (error instanceof CalendarSyncError) return privateJson({ error: error.message, code: "calendar_sync" }, { status: error.status });
      return privateJson({ error: "Unable to synchronize Google Calendar", code: "calendar_sync" }, { status: 502 });
    }
  }
  if (staff.department !== booking.department) return privateJson({ error: "Only the relevant department lead can decide this request" }, { status: 403 });
  if (booking.status !== "pending") return privateJson({ error: "This request has already been decided" }, { status: 409 });
  if (action === "accept") {
    const claimed = await env.DB.prepare("UPDATE bookings SET status = 'syncing' WHERE id = ? AND status = 'pending'").bind(bookingId).run();
    if ((claimed.meta?.changes ?? 0) !== 1) return privateJson({ error: "This request has already been decided" }, { status: 409 });
    try {
      const calendar = await syncCalendar(email);
      const result = await env.DB.prepare("UPDATE bookings SET status = 'accepted', calendar_event_id = ?, meet_url = ? WHERE id = ? AND status = 'syncing'").bind(calendar.calendarEventId, calendar.meetUrl, bookingId).run();
      if ((result.meta?.changes ?? 0) !== 1) return privateJson({ error: "This request has already been decided" }, { status: 409 });
      return privateJson({ status: "accepted", meetUrl: calendar.meetUrl });
    } catch (error) {
      await env.DB.prepare("UPDATE bookings SET status = 'pending' WHERE id = ? AND status = 'syncing'").bind(bookingId).run();
      if (error instanceof CalendarSyncError) return privateJson({ error: error.message, code: "calendar_sync" }, { status: error.status });
      return privateJson({ error: "Unable to synchronize Google Calendar", code: "calendar_sync" }, { status: 502 });
    }
  }
  const nextStatus = action === "defer" ? "deferred" : "denied";
  const result = await env.DB.prepare("UPDATE bookings SET status = ? WHERE id = ? AND status = 'pending'").bind(nextStatus, bookingId).run();
  if ((result.meta?.changes ?? 0) !== 1) return privateJson({ error: "This request has already been decided" }, { status: 409 });
  return privateJson({ status: nextStatus });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return privateJson({ error: "Cross-site requests are not allowed" }, { status: 403 });
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const email = staffEmailFromRequest(request);
  const staff = staffForEmail(email);
  if (!staff) return privateJson({ error: "Choose a valid interviewer profile" }, { status: 403 });

  const bookingId = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) return privateJson({ error: "Choose a valid interview request" }, { status: 400 });
  const booking = await env.DB.prepare("SELECT b.id, b.status, b.availability_id AS availabilityId, b.calendar_event_id AS calendarEventId, b.department, a.interviewer_email AS interviewerEmail FROM bookings b JOIN availability a ON a.id = b.availability_id WHERE b.id = ?").bind(bookingId).first<{ id: number; status: string; availabilityId: number; calendarEventId: string | null; department: string; interviewerEmail: string }>();
  if (!booking) return privateJson({ error: "Interview request not found" }, { status: 404 });

  const canDelete = staff.department === "All"
    ? booking.interviewerEmail === email || booking.status === "deferred"
    : booking.department === staff.department;
  if (!canDelete) return privateJson({ error: "You cannot delete this interview request" }, { status: 403 });

  if (booking.calendarEventId) {
    try {
      await deleteCalendarEvent(booking.calendarEventId);
    } catch (error) {
      if (error instanceof CalendarSyncError) return privateJson({ error: `${error.message} The request was not deleted; retry after Calendar is available.`, code: "calendar_delete" }, { status: error.status });
      return privateJson({ error: "Unable to delete the Google Calendar event. The request was not deleted.", code: "calendar_delete" }, { status: 502 });
    }
  }

  const results = await env.DB.batch([
    env.DB.prepare("DELETE FROM bookings WHERE id = ? AND availability_id = ?").bind(booking.id, booking.availabilityId),
    env.DB.prepare("UPDATE availability SET booked = 0 WHERE id = ? AND NOT EXISTS (SELECT 1 FROM bookings WHERE availability_id = ?)").bind(booking.availabilityId, booking.availabilityId),
  ]);
  if ((results[0].meta?.changes ?? 0) !== 1) return privateJson({ error: "Interview request not found" }, { status: 404 });
  return privateJson({ status: "deleted", releasedAvailabilityId: booking.availabilityId });
}
