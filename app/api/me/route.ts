import { isStaffGateOpen } from "@/lib/staff-gate";
import { privateJson } from "@/lib/http-security";
import { staffEmailFromRequest, staffForEmail } from "@/lib/staff";

export async function GET(request: Request) {
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const email = staffEmailFromRequest(request);
  if (!email) return privateJson({ error: "Choose an interviewer profile" }, { status: 400 });
  const staff = staffForEmail(email);
  if (!staff) return privateJson({ error: "Unknown interviewer profile" }, { status: 403 });
  return privateJson({ email: staff.email, department: staff.department, name: staff.name, role: staff.role });
}
