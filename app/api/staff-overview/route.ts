import { env } from "cloudflare:workers";
import { isStaffGateOpen } from "@/lib/staff-gate";
import { privateJson } from "@/lib/http-security";
import { staffDirectory } from "@/lib/staff";

type CalendarRow = {
  id: number;
  department: string;
  startsAt: string;
  endsAt: string;
  booked: number;
  interviewerEmail: string;
  candidateName: string | null;
  status: string | null;
  meetUrl: string | null;
};

export async function GET() {
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const result = await env.DB.prepare(
    "SELECT a.id, a.department, a.starts_at AS startsAt, a.ends_at AS endsAt, a.booked, a.interviewer_email AS interviewerEmail, b.candidate_name AS candidateName, b.status, b.meet_url AS meetUrl FROM availability a LEFT JOIN bookings b ON b.availability_id = a.id WHERE (a.booked = 0 OR b.status = 'accepted') AND a.starts_at >= '2026-10-18T15:00:00.000Z' AND a.starts_at < '2026-10-25T15:00:00.000Z' ORDER BY a.starts_at"
  ).all<CalendarRow>();
  const names = new Map(staffDirectory().map(member => [member.email, member.name]));
  const items = result.results.map(row => ({
    id: row.id,
    type: row.booked ? "confirmed" : "available",
    department: row.department,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    interviewer: names.get(row.interviewerEmail) ?? row.department + " Lead",
    candidateName: row.booked ? row.candidateName : null,
    meetUrl: row.booked && /^https:\/\/meet\.google\.com\//.test(row.meetUrl ?? "") ? row.meetUrl : null,
  }));
  return privateJson({ items, updatedAt: new Date().toISOString() });
}
