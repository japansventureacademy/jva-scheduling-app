import { env } from "cloudflare:workers";
import { headers } from "next/headers";

const COOKIE_NAME = "jva_staff_gate";

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function portalPassword() {
  return ((env as unknown as Record<string, string>).JVA_PORTAL_PASSWORD ?? "").trim();
}

export async function gateToken(password = portalPassword()) {
  return password ? digest(`jva-staff-gate:${password}`) : "";
}

export async function passwordMatches(value: string) {
  const configured = portalPassword();
  if (!configured) return false;
  return (await digest(value)) === (await digest(configured));
}

export async function isStaffGateOpen() {
  const cookie = (await headers()).get("cookie") ?? "";
  const supplied = cookie.split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) ?? "";
  const expected = await gateToken();
  return Boolean(expected && supplied === expected);
}

export function staffGateCookie(token: string) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
}
