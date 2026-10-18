import { headers } from "next/headers";
import { privateJson } from "@/lib/http-security";
import { isStaffGateOpen } from "@/lib/staff-gate";
import { staffForEmail } from "@/lib/staff";

export async function GET() {
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const email = (await headers()).get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
  if (!email) return privateJson({ error: "Sign-in required" }, { status: 401 });
  const staff = staffForEmail(email);
  if (!staff) return privateJson({ error: "This account is not authorized for the interviewer portal" }, { status: 403 });
  return privateJson({ department: staff.department, name: staff.name, role: staff.role });
}
