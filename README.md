# JVA Interview Scheduler

A responsive recruitment scheduling experience for Japan Venture Academy. The static prototype includes candidate intake, ranked department preferences, panel matching, timezone-aware slot selection, confirmation, calendar handoff, and rescheduling.

## Google Calendar + Meet connection

When an interviewer accepts (or the president covers) a request, the backend now creates an idempotent Google Calendar event, requests a unique Google Meet conference, emails all attendees, and stores the Google event ID and Meet URL. If Google fails, the booking is returned to its previous state so it can be retried safely.

Use OAuth owned by the recruiting calendar administrator:

1. In Google Cloud, enable the Google Calendar API and create an OAuth 2.0 web client.
2. Authorize that account for offline access with the `https://www.googleapis.com/auth/calendar.events` scope. The authorization request must use `access_type=offline`; securely retain the returned refresh token.
3. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` as deployment secrets. Optionally set `GOOGLE_CALENDAR_ID`; it defaults to `primary`.
4. Never place these values in source code or committed `.env` files. Restart/redeploy after setting them.

The OAuth account must be allowed to create Google Meet conferences and invite external attendees. Until all three required secrets are present, acceptance fails closed and no booking is marked accepted.

## Security configuration

Set `JVA_PORTAL_PASSWORD` as a deployment secret; never place it in source code or a committed environment file. Set a separate, randomly generated `JVA_SESSION_SECRET` (at least 32 random bytes) so staff session cookies are signed independently of the access code. Rotating either secret invalidates active staff sessions.

Configure the staff allowlist through the deployment environment—not source control—using `JVA_PRESIDENT_EMAIL`, `JVA_PARTNERSHIP_LEAD_EMAIL`, `JVA_MARKETING_LEAD_EMAIL`, and `JVA_LAB_LEAD_EMAIL`. If an address is omitted, that role is denied access by default.

Candidate records are returned only to an authenticated, allowlisted interviewer and are scoped to that interviewer's department. Candidate email addresses are retained server-side for calendar delivery but are not returned by dashboard APIs. For production, add a retention policy that deletes candidate records once recruitment obligations end.
