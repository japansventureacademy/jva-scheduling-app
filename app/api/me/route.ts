import { headers } from "next/headers";
import { isStaffGateOpen } from "@/lib/staff-gate";
import { privateJson } from "@/lib/http-security";

const STAFF: Record<string, { department: string; name: string; role: string }> = {
  "kueimaesaka.00@gmail.com": { department: "All", name: "Kuei Maesaka", role: "President" },
  "nhinguyenngan1@gmail.com": { department: "Partnership", name: "Nahi Nguyen", role: "Partnership Lead" },
  "giatridrajat1503@gmail.com": { department: "Marketing", name: "Giatri Drajat", role: "Marketing Lead" },
  "sakurakoesaka@gmail.com": { department: "Lab", name: "Sakurako Esaka", role: "Lab Lead" },
};

export async function GET() {
  if (!(await isStaffGateOpen())) return privateJson({ error: "Interviewer access code required", code: "staff_gate" }, { status: 401 });
  const h = await headers();
  const email = h.get("oai-authenticated-user-email")?.toLowerCase() ?? "";
  if (!email) return privateJson({ error: "Sign-in required" }, { status: 401 });
  if (!STAFF[email]) return privateJson({ error: "This email is not authorized for the interviewer portal" }, { status: 403 });
  return privateJson({ email, ...STAFF[email] });
}
