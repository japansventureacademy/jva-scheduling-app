import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { privateJson } from "@/lib/http-security";
import { isStaffGateOpen } from "@/lib/staff-gate";
import { staffDirectory, staffForEmail } from "@/lib/staff";

type CalendarRow = {
  id: number;
  department: string;
  startsAt: string;
  endsAt: string;
  booked: number;
  interviewerEmail: string;
  candidateName: string | null;
  meetUrl: string | null;
};

export async function GET() {
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const email = (await headers()).get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
  const staff = staffForEmail(email);
  if (!staff) return privateJson({ error: "Authorized interviewer sign-in required" }, { status: 403 });

  const select = "SELECT a.id, a.department, a.starts_at AS startsAt, a.ends_at AS endsAt, a.booked, a.interviewer_email AS interviewerEmail, b.candidate_name AS candidateName, b.meet_url AS meetUrl FROM availability a LEFT JOIN bookings b ON b.availability_id = a.id";
  const timeWindow = "a.starts_at >= '2026-10-18T15:00:00.000Z' AND a.starts_at < '2026-10-25T15:00:00.000Z'";
  const result = staff.department === "All"
    ? await env.DB.prepare(`${select} WHERE ${timeWindow} AND (a.booked = 0 OR (b.status = 'accepted' AND a.interviewer_email = ?)) ORDER BY a.starts_at`).bind(email).all<CalendarRow>()
    : await env.DB.prepare(`${select} WHERE ${timeWindow} AND a.department = ? AND (a.booked = 0 OR b.status = 'accepted') ORDER BY a.starts_at`).bind(staff.department).all<CalendarRow>();

  const roles = new Map(staffDirectory().map(member => [member.email, member.role]));
  const items = result.results.map(row => ({
    id: row.id,
    type: row.booked ? "confirmed" : "available",
    department: row.department,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    interviewer: roles.get(row.interviewerEmail) ?? `${row.department} Lead`,
    candidateName: row.booked ? row.candidateName : null,
    meetUrl: row.booked && /^https:\/\/meet\.google\.com\//.test(row.meetUrl ?? "") ? row.meetUrl : null,
  }));
  return privateJson({ items, updatedAt: new Date().toISOString() });
}
