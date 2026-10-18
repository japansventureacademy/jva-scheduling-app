import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { createInterviewEvent, isGoogleCalendarConfigured } from "@/lib/google-calendar";
import { isSameOriginRequest, privateJson, readJson, RequestBodyError } from "@/lib/http-security";
import { isStaffGateOpen } from "@/lib/staff-gate";
import { presidentEmail, staffForEmail } from "@/lib/staff";

const DEPARTMENTS = ["Partnership", "Marketing", "Lab"];

type BookingRecord = {
  id: number;
  status: string;
  department: string;
  availabilityId: number;
  candidateEmail: string;
  interviewerEmail: string;
  startsAt: string;
  endsAt: string;
};

async function signedInEmail() {
  return (await headers()).get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
}

export async function GET() {
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const email = await signedInEmail();
  const staff = staffForEmail(email);
  if (!staff) return privateJson({ error: "Authorized interviewer sign-in required" }, { status: 403 });

  const baseQuery = "SELECT b.id, b.candidate_name AS candidateName, b.department, b.status, b.meet_url AS meetUrl, a.starts_at AS startsAt, a.ends_at AS endsAt, CASE WHEN a.interviewer_email = ? THEN 1 ELSE 0 END AS assignedToRequester FROM bookings b JOIN availability a ON a.id = b.availability_id";
  const result = staff.department === "All"
    ? await env.DB.prepare(`${baseQuery} WHERE a.interviewer_email = ? OR b.status = 'deferred' ORDER BY a.starts_at`).bind(email, email).all()
    : await env.DB.prepare(`${baseQuery} WHERE b.department = ? ORDER BY a.starts_at`).bind(email, staff.department).all();
  return privateJson({ bookings: result.results, calendarConnected: isGoogleCalendarConfigured() });
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

    const results = await env.DB.batch([
      env.DB.prepare("INSERT INTO bookings (availability_id, candidate_name, candidate_email, department, preferences, status, timeline_acknowledged_at) SELECT id, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP FROM availability WHERE id = ? AND department = ? AND booked = 0").bind(name, email, department, JSON.stringify(preferences), id, department),
      env.DB.prepare("UPDATE availability SET booked = 1 WHERE id = ? AND department = ? AND booked = 0").bind(id, department),
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
  const email = await signedInEmail();
  const staff = staffForEmail(email);
  if (!staff) return privateJson({ error: "Authorized interviewer sign-in required" }, { status: 403 });

  let body: { bookingId?: unknown; action?: unknown };
  try {
    body = await readJson(request, 1024);
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: error.message }, { status: error.status });
    return privateJson({ error: "Unable to process request" }, { status: 400 });
  }
  const bookingId = Number(body.bookingId);
  const action = typeof body.action === "string" ? body.action : "";
  if (!Number.isInteger(bookingId) || bookingId <= 0 || !["accept", "defer", "deny", "cover"].includes(action)) return privateJson({ error: "Invalid decision" }, { status: 400 });

  const booking = await env.DB.prepare("SELECT b.id, b.status, b.department, b.availability_id AS availabilityId, b.candidate_email AS candidateEmail, a.interviewer_email AS interviewerEmail, a.starts_at AS startsAt, a.ends_at AS endsAt FROM bookings b JOIN availability a ON a.id = b.availability_id WHERE b.id = ?").bind(bookingId).first<BookingRecord>();
  if (!booking) return privateJson({ error: "Interview request not found" }, { status: 404 });

  const isPresident = email === presidentEmail();
  if (isPresident && (action !== "cover" || booking.status !== "deferred")) return privateJson({ error: "The president can cover deferred requests only" }, { status: 409 });
  if (!isPresident && staff.department !== booking.department) return privateJson({ error: "Only the relevant department lead can decide this request" }, { status: 403 });
  if (!isPresident && booking.status !== "pending") return privateJson({ error: "This request has already been decided" }, { status: 409 });

  if (!isPresident && action !== "accept") {
    const nextStatus = action === "defer" ? "deferred" : "denied";
    const result = await env.DB.prepare("UPDATE bookings SET status = ? WHERE id = ? AND status = 'pending'").bind(nextStatus, bookingId).run();
    if ((result.meta?.changes ?? 0) !== 1) return privateJson({ error: "This request has already been decided" }, { status: 409 });
    return privateJson({ status: nextStatus });
  }

  if (!isGoogleCalendarConfigured()) return privateJson({ error: "Google Calendar is not connected. Ask an administrator to finish OAuth setup." }, { status: 503 });
  const previousStatus = isPresident ? "deferred" : "pending";
  const claim = await env.DB.prepare("UPDATE bookings SET status = 'scheduling' WHERE id = ? AND status = ?").bind(bookingId, previousStatus).run();
  if ((claim.meta?.changes ?? 0) !== 1) return privateJson({ error: "This request is already being processed" }, { status: 409 });

  try {
    const calendar = await createInterviewEvent({
      id: booking.id,
      candidateEmail: booking.candidateEmail,
      department: booking.department,
      interviewerEmail: isPresident ? email : booking.interviewerEmail,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
    });
    const updates = [
      env.DB.prepare("UPDATE bookings SET status = 'accepted', calendar_event_id = ?, meet_url = ? WHERE id = ? AND status = 'scheduling'").bind(calendar.eventId, calendar.meetUrl, bookingId),
    ];
    if (isPresident) updates.push(env.DB.prepare("UPDATE availability SET interviewer_email = ? WHERE id = ?").bind(email, booking.availabilityId));
    const results = await env.DB.batch(updates);
    if ((results[0].meta?.changes ?? 0) !== 1) throw new Error("Booking state changed during scheduling");
    return privateJson({ status: "accepted", meetUrl: calendar.meetUrl });
  } catch {
    await env.DB.prepare("UPDATE bookings SET status = ? WHERE id = ? AND status = 'scheduling'").bind(previousStatus, bookingId).run();
    return privateJson({ error: "Google Calendar could not create the event. No acceptance was saved; please retry." }, { status: 502 });
  }
}
