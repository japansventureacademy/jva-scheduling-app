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
    { email: normalizedEmail(configured.JVA_PRESIDENT_EMAIL), department: "All" as const, name: "President", role: "President" },
    { email: normalizedEmail(configured.JVA_PARTNERSHIP_LEAD_EMAIL), department: "Partnership" as const, name: "Partnership Lead", role: "Partnership Lead" },
    { email: normalizedEmail(configured.JVA_MARKETING_LEAD_EMAIL), department: "Marketing" as const, name: "Marketing Lead", role: "Marketing Lead" },
    { email: normalizedEmail(configured.JVA_LAB_LEAD_EMAIL), department: "Lab" as const, name: "Lab Lead", role: "Lab Lead" },
  ].filter(member => member.email);
}

export function staffForEmail(email: string) {
  const normalized = normalizedEmail(email);
  return staffDirectory().find(member => member.email === normalized);
}

export function presidentEmail() {
  return staffDirectory().find(member => member.department === "All")?.email ?? "";
}
