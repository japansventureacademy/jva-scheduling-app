import { env } from "cloudflare:workers";
import { isStaffGateOpen } from "@/lib/staff-gate";
import { isSameOriginRequest, privateJson, readJson, RequestBodyError } from "@/lib/http-security";
import { staffEmailFromRequest, staffForEmail } from "@/lib/staff";

function staffIdentity(request: Request) {
  const email = staffEmailFromRequest(request);
  return { email, staff: staffForEmail(email) };
}

export async function GET(request: Request) {
  const department = new URL(request.url).searchParams.get("department") ?? "";
  if (department && !["Partnership", "Marketing", "Lab"].includes(department)) return privateJson({ error: "Invalid department" }, { status: 400 });
  const result = await env.DB.prepare("SELECT id, department, starts_at AS startsAt, ends_at AS endsAt FROM availability WHERE booked = 0 AND (? = '' OR department = ?) AND starts_at >= '2026-10-18T15:00:00.000Z' AND starts_at < '2026-10-25T15:00:00.000Z' ORDER BY starts_at").bind(department, department).all();
  return privateJson({ availability: result.results });
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
    if (staff.department === "All") return privateJson({ error: "The president is optional and does not publish department availability" }, { status: 400 });
    const windowStart = Date.parse("2026-10-18T15:00:00.000Z");
    const windowEnd = Date.parse("2026-10-25T15:00:00.000Z");
    const valid = slots.filter(slot => {
      if (typeof slot?.startsAt !== "string" || typeof slot?.endsAt !== "string") return false;
      const start = Date.parse(slot.startsAt);
      const end = Date.parse(slot.endsAt);
      return Number.isFinite(start) && Number.isFinite(end) && start >= windowStart && start < windowEnd && end - start === 45 * 60_000;
    }) as Array<{ startsAt: string; endsAt: string }>;
    if (valid.length !== slots.length) return privateJson({ error: "Every slot must be a valid 45-minute interval from October 19–25, 2026" }, { status: 400 });
    const statements = [env.DB.prepare("DELETE FROM availability WHERE interviewer_email = ? AND booked = 0").bind(email), ...valid.map(slot => env.DB.prepare("INSERT INTO availability (interviewer_email, department, starts_at, ends_at, booked) VALUES (?, ?, ?, ?, 0)").bind(email, staff.department, slot.startsAt, slot.endsAt))];
    await env.DB.batch(statements);
    return privateJson({ status: "success", count: valid.length });
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: error.message }, { status: error.status });
    return privateJson({ error: "Unable to process request" }, { status: 400 });
  }
}
