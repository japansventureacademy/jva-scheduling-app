import { gateToken, isStaffGateOpen, passwordMatches, staffGateCookie } from "@/lib/staff-gate";

export async function GET() {
  return Response.json({ unlocked: await isStaffGateOpen() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Cross-site requests are not allowed" }, { status: 403 });
  const body = await request.json() as { password?: string };
  if (!(await passwordMatches(body.password ?? ""))) return Response.json({ error: "Incorrect access code" }, { status: 401 });
  return Response.json({ unlocked: true }, { headers: { "Set-Cookie": staffGateCookie(await gateToken()), "Cache-Control": "no-store" } });
}
