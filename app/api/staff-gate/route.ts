import { gateToken, isStaffGateOpen, passwordMatches, staffGateCookie } from "@/lib/staff-gate";
import { isSameOriginRequest, privateJson, readJson, RequestBodyError } from "@/lib/http-security";

const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function clientKey(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0].trim() ?? "unknown";
}

export async function GET() {
  return privateJson({ unlocked: await isStaffGateOpen() });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return privateJson({ error: "Cross-site requests are not allowed" }, { status: 403 });
  const key = clientKey(request);
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.resetAt > now && current.count >= MAX_ATTEMPTS) {
    return privateJson({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)) } });
  }

  try {
    const body = await readJson<{ password?: unknown }>(request, 1024);
    const password = typeof body.password === "string" ? body.password : "";
    if (!(await passwordMatches(password))) {
      const next = current && current.resetAt > now ? { count: current.count + 1, resetAt: current.resetAt } : { count: 1, resetAt: now + ATTEMPT_WINDOW_MS };
      attempts.set(key, next);
      return privateJson({ error: "Incorrect access code" }, { status: 401 });
    }
    attempts.delete(key);
    return privateJson({ unlocked: true }, { headers: { "Set-Cookie": staffGateCookie(await gateToken()) } });
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: error.message }, { status: error.status });
    return privateJson({ error: "Unable to process request" }, { status: 400 });
  }
}
