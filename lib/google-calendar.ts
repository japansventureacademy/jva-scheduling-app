import { env } from "cloudflare:workers";

type CalendarBooking = {
  id: number;
  candidateEmail: string;
  department: string;
  interviewerEmail: string;
  startsAt: string;
  endsAt: string;
};

type GoogleEvent = {
  id?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
    createRequest?: { status?: { statusCode?: string } };
  };
};

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function calendarConfig() {
  const configured = env as unknown as Record<string, string | undefined>;
  return {
    clientId: configured.GOOGLE_CLIENT_ID?.trim() ?? "",
    clientSecret: configured.GOOGLE_CLIENT_SECRET?.trim() ?? "",
    refreshToken: configured.GOOGLE_REFRESH_TOKEN?.trim() ?? "",
    calendarId: configured.GOOGLE_CALENDAR_ID?.trim() || "primary",
  };
}

export function isGoogleCalendarConfigured() {
  const config = calendarConfig();
  return Boolean(config.clientId && config.clientSecret && config.refreshToken);
}

async function accessToken() {
  const config = calendarConfig();
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new CalendarIntegrationError("Google Calendar is not configured");
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new CalendarIntegrationError("Google authorization failed");
  const body = await response.json() as { access_token?: unknown };
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new CalendarIntegrationError("Google authorization returned no access token");
  }
  return body.access_token;
}

function eventId(bookingId: number) {
  // Google-created event IDs accept base32hex characters (a-v and 0-9).
  return `jvacal${bookingId}`;
}

function meetUrl(event: GoogleEvent) {
  if (event.hangoutLink?.startsWith("https://meet.google.com/")) return event.hangoutLink;
  return event.conferenceData?.entryPoints?.find(entry => entry.entryPointType === "video" && entry.uri?.startsWith("https://meet.google.com/"))?.uri ?? null;
}

async function getEvent(token: string, calendarId: string, id: string) {
  const response = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}?conferenceDataVersion=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new CalendarIntegrationError("Unable to read the Google Calendar event");
  return response.json() as Promise<GoogleEvent>;
}

export async function createInterviewEvent(booking: CalendarBooking) {
  const config = calendarConfig();
  const token = await accessToken();
  const id = eventId(booking.id);
  const attendees = [...new Set([booking.candidateEmail, booking.interviewerEmail])].map(email => ({ email }));
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(config.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      summary: `JVA Core Team Interview · ${booking.department}`,
      description: "45-minute interview reserved through the JVA recruitment scheduler.",
      start: { dateTime: booking.startsAt },
      end: { dateTime: booking.endsAt },
      attendees,
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      guestsCanSeeOtherGuests: false,
      conferenceData: {
        createRequest: {
          requestId: `jva-calendar-${booking.id}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }),
  });

  let event: GoogleEvent;
  if (response.status === 409) {
    // A deterministic event ID makes retries safe if Google succeeded but the
    // original request lost its response before the database was updated.
    event = await getEvent(token, config.calendarId, id);
  } else {
    if (!response.ok) throw new CalendarIntegrationError("Google Calendar rejected the event");
    event = await response.json() as GoogleEvent;
  }

  let videoUrl = meetUrl(event);
  for (let attempt = 0; !videoUrl && attempt < 2; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 200));
    event = await getEvent(token, config.calendarId, id);
    videoUrl = meetUrl(event);
  }
  if (!event.id || !videoUrl) throw new CalendarIntegrationError("Google Meet creation did not complete");
  return { eventId: event.id, meetUrl: videoUrl };
}

export class CalendarIntegrationError extends Error {}
