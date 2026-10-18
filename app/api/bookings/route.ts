import { env } from "cloudflare:workers";
import { headers } from "next/headers";

const ALLOWED = new Set(["kueimaesaka.00@gmail.com", "nhinguyenngan1@gmail.com", "giatridrajat1503@gmail.com", "sakurakoesaka@gmail.com"]);

export async function GET() {
  const h = await headers();
  const email = h.get("oai-authenticated-user-email")?.toLowerCase() ?? "";
  if (!ALLOWED.has(email)) return Response.json({ error: "Authorized interviewer sign-in required" }, { status: 403 });
  const result = await env.DB.prepare("SELECT b.id, b.candidate_name AS candidateName, b.candidate_email AS candidateEmail, b.department, b.preferences, b.status, b.meet_url AS meetUrl, a.starts_at AS startsAt, a.ends_at AS endsAt, a.interviewer_email AS interviewerEmail FROM bookings b JOIN availability a ON a.id = b.availability_id ORDER BY a.starts_at").all();
  return Response.json({ bookings: result.results }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Cross-site requests are not allowed" }, { status: 403 });
  const body = await request.json() as { availabilityId?: number; candidateName?: string; candidateEmail?: string; department?: string; preferences?: string[] };
  const id = Number(body.availabilityId);
  const name = body.candidateName?.trim() ?? "";
  const email = body.candidateEmail?.trim().toLowerCase() ?? "";
  const department = body.department?.trim() ?? "";
  if (!Number.isInteger(id) || !name || !email.includes("@") || !["Partnership", "Marketing", "Lab"].includes(department)) return Response.json({ error: "Invalid booking details" }, { status: 400 });
  try {
    const results = await env.DB.batch([
      env.DB.prepare("INSERT INTO bookings (availability_id, candidate_name, candidate_email, department, preferences, status) SELECT id, ?, ?, ?, ?, 'confirmed' FROM availability WHERE id = ? AND booked = 0").bind(name, email, department, JSON.stringify(body.preferences ?? [department]), id),
      env.DB.prepare("UPDATE availability SET booked = 1 WHERE id = ? AND booked = 0").bind(id),
    ]);
    if ((results[0].meta?.changes ?? 0) !== 1) return Response.json({ error: "This slot was just taken. Please choose another." }, { status: 409 });
    const booked = await env.DB.prepare("SELECT b.id, a.starts_at AS startsAt, a.ends_at AS endsAt FROM bookings b JOIN availability a ON a.id = b.availability_id WHERE b.availability_id = ?").bind(id).first();
    if (!booked) return Response.json({ error: "This slot was just taken. Please choose another." }, { status: 409 });
    return Response.json({ status: "success", booking: booked }, { status: 201 });
  } catch {
    return Response.json({ error: "This slot was just taken. Please choose another." }, { status: 409 });
  }
}
