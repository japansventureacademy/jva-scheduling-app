# JVA Interview Scheduler

A responsive recruitment scheduling experience for Japan Venture Academy. The static prototype includes candidate intake, ranked department preferences, panel matching, timezone-aware slot selection, confirmation, calendar handoff, and rescheduling.

## Google Calendar + Meet production integration

The UI is ready for a server endpoint that:

1. Reads free/busy windows for the selected department lead and president.
2. Rechecks availability at confirmation to prevent double booking.
3. Creates a Google Calendar event with the candidate and interviewers as attendees.
4. Requests Google Meet conference data and sends updates to all attendees.
5. Stores a signed reschedule/cancellation token and sends reminder emails.

Use a Google Workspace service account with domain-wide delegation, or OAuth owned by the recruiting calendar administrator. Keep credentials server-side only.

## Security configuration

Set `JVA_PORTAL_PASSWORD` as a deployment secret; never place it in source code or a committed environment file. Set a separate, randomly generated `JVA_SESSION_SECRET` (at least 32 random bytes) so staff session cookies are signed independently of the access code. Rotating either secret invalidates active staff sessions.

Configure the staff allowlist through the deployment environment—not source control—using `JVA_PRESIDENT_EMAIL`, `JVA_PARTNERSHIP_LEAD_EMAIL`, `JVA_MARKETING_LEAD_EMAIL`, and `JVA_LAB_LEAD_EMAIL`. If an address is omitted, that role is denied access by default.

Candidate records are returned only to an authenticated, allowlisted interviewer and are scoped to that interviewer's department. Candidate email addresses are retained server-side for calendar delivery but are not returned by dashboard APIs. For production, add a retention policy that deletes candidate records once recruitment obligations end.
