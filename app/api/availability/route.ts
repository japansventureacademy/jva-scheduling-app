import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { isStaffGateOpen } from "@/lib/staff-gate";

const STAFF: Record<string, { department: string; name: string }> = {
  "kueimaesaka.00@gmail.com": { department: "All", name: "Kuei Maesaka" },
  "nhinguyenngan1@gmail.com": { department: "Partnership", name: "Nahi Nguyen" },
  "giatridrajat1503@gmail.com": { department: "Marketing", name: "Giatri Drajat" },
  "sakurakoesaka@gmail.com": { department: "Lab", name: "Sakurako Esaka" },
};

async function staffIdentity() {
  const h = await headers();
  const email = h.get("oai-authenticated-user-email")?.toLowerCase() ?? "";
  return { email, staff: STAFF[email] };
}

export async function GET(request: Request) {
  const department = new URL(request.url).searchParams.get("department") ?? "";
  const result = await env.DB.prepare("SELECT id, interviewer_email AS interviewerEmail, department, starts_at AS startsAt, ends_at AS endsAt FROM availability WHERE booked = 0 AND (? = '' OR department = ?) AND starts_at >= '2026-10-18T15:00:00.000Z' AND starts_at < '2026-10-25T15:00:00.000Z' ORDER BY starts_at").bind(department, department).all();
  return Response.json({ availability: result.results }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Cross-site requests are not allowed" }, { status: 403 });
  if (!(await isStaffGateOpen())) return Response.json({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const { email, staff } = await staffIdentity();
  if (!staff) return Response.json({ error: "Authorized interviewer sign-in required" }, { status: 403 });
  const body = await request.json() as { slots?: Array<{ startsAt: string; endsAt: string }> };
  const slots = Array.isArray(body.slots) ? body.slots.slice(0, 100) : [];
  if (staff.department === "All") return Response.json({ error: "The president is optional and does not publish department availability" }, { status: 400 });
  const valid = slots.filter(s => /^2026-10-(19|20|21|22|23|24|25)T/.test(s.startsAt) && Date.parse(s.endsAt) - Date.parse(s.startsAt) === 45 * 60000);
  if (valid.length !== slots.length) return Response.json({ error: "Every slot must be a valid 45-minute interval from October 19–25, 2026" }, { status: 400 });
  const statements = [env.DB.prepare("DELETE FROM availability WHERE interviewer_email = ? AND booked = 0").bind(email), ...valid.map(s => env.DB.prepare("INSERT INTO availability (interviewer_email, department, starts_at, ends_at, booked) VALUES (?, ?, ?, ?, 0)").bind(email, staff.department, s.startsAt, s.endsAt))];
  await env.DB.batch(statements);
  return Response.json({ status: "success", count: valid.length });
}
