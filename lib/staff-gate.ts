import { env } from "cloudflare:workers";
import { headers } from "next/headers";

const COOKIE_NAME = "__Host-jva_staff_gate";

const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let i = 0; i < leftBytes.length; i += 1) difference |= leftBytes[i] ^ rightBytes[i];
  return difference === 0;
}

async function sign(value: string) {
  const keyMaterial = ((env as unknown as Record<string, string>).JVA_SESSION_SECRET ?? portalPassword()).trim();
  if (!keyMaterial) return "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyMaterial),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function portalPassword() {
  return ((env as unknown as Record<string, string>).JVA_PORTAL_PASSWORD ?? "").trim();
}

export async function gateToken(expiresAt = Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS) {
  const payload = `v1.${expiresAt}`;
  const signature = await sign(payload);
  return signature ? `${payload}.${signature}` : "";
}

export async function passwordMatches(value: string) {
  const configured = portalPassword();
  if (!configured) return false;
  return timingSafeEqual(await digest(value), await digest(configured));
}

export async function isStaffGateOpen() {
  const cookie = (await headers()).get("cookie") ?? "";
  const supplied = cookie.split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) ?? "";
  const match = /^v1\.(\d{10})\.([a-f0-9]{64})$/.exec(supplied);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  const expected = await gateToken(expiresAt);
  return Boolean(expected && timingSafeEqual(supplied, expected));
}

export function staffGateCookie(token: string) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_LIFETIME_SECONDS}`;
}
