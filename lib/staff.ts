import { env } from "cloudflare:workers";

export type StaffMember = {
  email: string;
  department: "All" | "Partnership" | "Marketing" | "Lab";
  name: string;
  role: string;
};

function normalizedEmail(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function staffDirectory(): StaffMember[] {
  const configured = env as unknown as Record<string, string | undefined>;
  return [
    { email: normalizedEmail(configured.JVA_PRESIDENT_EMAIL ?? "kueimaesaka.00@gmail.com"), department: "All" as const, name: "Kuei Maesaka", role: "President" },
    { email: normalizedEmail(configured.JVA_PARTNERSHIP_LEAD_EMAIL ?? "nhinguyenngan1@gmail.com"), department: "Partnership" as const, name: "Nahi Nguyen", role: "Partnership Lead" },
    { email: normalizedEmail(configured.JVA_MARKETING_LEAD_EMAIL ?? "giatridrajat1503@gmail.com"), department: "Marketing" as const, name: "Giatri Drajat", role: "Marketing Lead" },
    { email: normalizedEmail(configured.JVA_LAB_LEAD_EMAIL ?? "sakurakoesaka@gmail.com"), department: "Lab" as const, name: "Sakurako Esaka", role: "Lab Lead" },
  ].filter(member => member.email);
}

export function staffForEmail(email: string) {
  const normalized = normalizedEmail(email);
  return staffDirectory().find(member => member.email === normalized);
}

export function staffEmailFromRequest(request: Request) {
  return normalizedEmail(request.headers.get("x-jva-staff") ?? undefined);
}

export function presidentEmail() {
  return staffDirectory().find(member => member.department === "All")?.email ?? "";
}
