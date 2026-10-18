import { env } from "cloudflare:workers";
import { isStaffGateOpen } from "@/lib/staff-gate";
import { isSameOriginRequest, privateJson, readJson, RequestBodyError } from "@/lib/http-security";
import { staffEmailFromRequest, staffForEmail } from "@/lib/staff";

function staffIdentity(request: Request) {
  const email = staffEmailFromRequest(request);
  return { email, staff: staffForEmail(email) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const department = url.searchParams.get("department") ?? "";
  if (url.searchParams.get("mine") === "1") {
    if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
    const { email, staff } = staffIdentity(request);
    if (!staff) return privateJson({ error: "Choose a valid interviewer profile" }, { status: 403 });
    const result = await env.DB.prepare("SELECT id, department, starts_at AS startsAt, ends_at AS endsAt, booked FROM availability WHERE interviewer_email = ? AND starts_at >= '2026-10-18T15:00:00.000Z' AND starts_at < '2026-10-25T15:00:00.000Z' ORDER BY starts_at").bind(email).all();
    return privateJson({ availability: result.results });
  }
  if (department && !["Partnership", "Marketing", "Lab"].includes(department)) return privateJson({ error: "Invalid department" }, { status: 400 });
  const result = await env.DB.prepare("SELECT a.id, a.department, a.starts_at AS startsAt, a.ends_at AS endsAt, CASE WHEN a.department = 'All' THEN 'President' ELSE 'Department lead' END AS interviewerRole FROM availability a WHERE a.booked = 0 AND (? = '' OR a.department = ? OR a.department = 'All') AND a.starts_at >= '2026-10-18T15:00:00.000Z' AND a.starts_at < '2026-10-25T15:00:00.000Z' AND NOT EXISTS (SELECT 1 FROM availability busy WHERE busy.interviewer_email = a.interviewer_email AND busy.booked = 1 AND busy.starts_at < a.ends_at AND busy.ends_at > a.starts_at) AND (a.department <> 'All' OR ? = '' OR NOT EXISTS (SELECT 1 FROM availability lead WHERE lead.department = ? AND lead.booked = 0 AND lead.starts_at = a.starts_at AND lead.ends_at = a.ends_at)) ORDER BY a.starts_at, CASE WHEN a.department = 'All' THEN 1 ELSE 0 END").bind(department, department, department, department).all();
  return privateJson({ availability: result.results });
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return privateJson({ error: "Cross-site requests are not allowed" }, { status: 403 });
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const { email, staff } = staffIdentity(request);
  if (!staff) return privateJson({ error: "Choose a valid interviewer profile" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return privateJson({ error: "Choose a valid availability slot" }, { status: 400 });
  const result = await env.DB.prepare("DELETE FROM availability WHERE id = ? AND interviewer_email = ? AND booked = 0").bind(id, email).run();
  if (!result.meta.changes) return privateJson({ error: "This time is already booked or no longer exists" }, { status: 409 });
  return privateJson({ status: "success", id });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return privateJson({ error: "Cross-site requests are not allowed" }, { status: 403 });
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const { email, staff } = staffIdentity(request);
  if (!staff) return privateJson({ error: "Choose a valid interviewer profile" }, { status: 403 });
  try {
    const body = await readJson<{ slots?: unknown }>(request);
    if (!Array.isArray(body.slots) || body.slots.length > 100) return privateJson({ error: "Provide at most 100 availability slots" }, { status: 400 });
    const slots = body.slots as Array<{ startsAt?: unknown; endsAt?: unknown }>;
    const windowStart = Date.parse("2026-10-18T15:00:00.000Z");
    const windowEnd = Date.parse("2026-10-25T15:00:00.000Z");
    const valid = slots.filter(slot => {
      if (typeof slot?.startsAt !== "string" || typeof slot?.endsAt !== "string") return false;
      const start = Date.parse(slot.startsAt);
      const end = Date.parse(slot.endsAt);
      return Number.isFinite(start) && Number.isFinite(end) && start >= windowStart && start < windowEnd && end - start === 45 * 60_000;
    }) as Array<{ startsAt: string; endsAt: string }>;
    if (valid.length !== slots.length) return privateJson({ error: "One or more times fall outside October 19–25, 2026. Check the date and try again." }, { status: 400 });
    const statements = [env.DB.prepare("DELETE FROM availability WHERE interviewer_email = ? AND booked = 0").bind(email), ...valid.map(slot => env.DB.prepare("INSERT INTO availability (interviewer_email, department, starts_at, ends_at, booked) SELECT ?, ?, ?, ?, 0 WHERE NOT EXISTS (SELECT 1 FROM availability busy WHERE busy.interviewer_email = ? AND busy.booked = 1 AND busy.starts_at < ? AND busy.ends_at > ?)").bind(email, staff.department, slot.startsAt, slot.endsAt, email, slot.endsAt, slot.startsAt))];
    const results = await env.DB.batch(statements);
    const count = results.slice(1).reduce((total, result) => total + (result.meta?.changes ?? 0), 0);
    return privateJson({ status: "success", count, skippedConflicts: valid.length - count });
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: error.message }, { status: error.status });
    return privateJson({ error: "Unable to process request" }, { status: 400 });
  }
}
