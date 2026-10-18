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
