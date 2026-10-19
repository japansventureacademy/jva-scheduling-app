import { env } from "cloudflare:workers";

type CalendarBooking = {
  id: number;
  candidateEmail: string;
  candidateName: string;
  department: string;
  endsAt: string;
  interviewerEmail: string;
  interviewerName: string;
  startsAt: string;
};

export class CalendarSyncError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "CalendarSyncError";
    this.status = status;
  }
}

function calendarConfig() {
  const values = env as unknown as Record<string, string | undefined>;
  return {
    calendarId: values.JVA_GOOGLE_CALENDAR_ID?.trim() || values.GOOGLE_CALENDAR_ID?.trim() || "japansventureacademy@gmail.com",
    clientId: values.JVA_GOOGLE_CLIENT_ID?.trim() || values.GOOGLE_CLIENT_ID?.trim() || "",
    clientSecret: values.JVA_GOOGLE_CLIENT_SECRET?.trim() || values.GOOGLE_CLIENT_SECRET?.trim() || "",
    refreshToken: values.JVA_GOOGLE_REFRESH_TOKEN?.trim() || values.GOOGLE_REFRESH_TOKEN?.trim() || "",
  };
}

async function calendarAccess() {
  const config = calendarConfig();
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new CalendarSyncError("Google Calendar is not connected yet. The interview remains pending; connect the JVA calendar and try again.", 503);
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: config.refreshToken,
    }),
  });
  const data = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new CalendarSyncError(data.error_description || "Google Calendar authorization failed. Reconnect the JVA calendar and try again.", 502);
  return { accessToken: data.access_token, calendarId: config.calendarId };
}

function eventId(bookingId: number) {
  return `jva2026booking${bookingId}`;
}

function meetingLink(event: { hangoutLink?: string; conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> } }) {
  const link = event.hangoutLink || event.conferenceData?.entryPoints?.find(point => point.entryPointType === "video")?.uri || "";
  return /^https:\/\/meet\.google\.com\//.test(link) ? link : "";
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

function base64Url(value: string) {
  return base64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function confirmationBody(booking: CalendarBooking, meetUrl: string) {
  const startsAt = new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(booking.startsAt));
  return [
    `Hello ${booking.candidateName},`,
    "",
    `Your JVA ${booking.department} interview is confirmed.`,
    `When: ${startsAt} (Japan Standard Time)`,
    `Interviewer: ${booking.interviewerName}`,
    `Google Meet: ${meetUrl}`,
    "",
    "The interview reserves 45 minutes: 30 minutes for the interview and 15 minutes for questions.",
    "A Google Calendar invitation has also been sent to this email address.",
    "",
    "Japan Venture Academy",
  ].join("\r\n");
}

async function sendGmailConfirmation(accessToken: string, calendarId: string, booking: CalendarBooking, meetUrl: string) {
  const body = confirmationBody(booking, meetUrl);
  const mime = [
    `From: Japan Venture Academy <${calendarId}>`,
    `Reply-To: ${calendarId}`,
    `To: ${booking.candidateEmail}`,
    `Subject: JVA ${booking.department} interview confirmed`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    `Message-ID: <jva-booking-${booking.id}-confirmed@japansventureacademy.com>`,
    "",
    base64(body),
  ].join("\r\n");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(mime) }),
  });
  return response.ok;
}

async function sendCalendarConfirmation(accessToken: string, calendarId: string, eventIdValue: string, booking: CalendarBooking, meetUrl: string) {
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventIdValue)}?conferenceDataVersion=1&sendUpdates=all`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: `Confirmed: JVA ${booking.department} interview — ${booking.candidateName}`,
      description: confirmationBody(booking, meetUrl),
      extendedProperties: { private: { jvaBookingId: String(booking.id), confirmationDelivered: "calendar-update" } },
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new CalendarSyncError(data.error?.message || "The Meet invitation was created, but the confirmation email could not be delivered. Retry confirmation.");
  }
}

export async function ensureCalendarEvent(booking: CalendarBooking) {
  const { accessToken, calendarId } = await calendarAccess();
  const id = eventId(booking.id);
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const payload = {
    id,
    summary: `JVA ${booking.department} interview — ${booking.candidateName}`,
    description: "JVA Core Team recruitment interview. 45 minutes reserved: 30-minute interview plus 15-minute Q&A.",
    start: { dateTime: booking.startsAt },
    end: { dateTime: booking.endsAt },
    attendees: [{ email: booking.candidateEmail }, { email: booking.interviewerEmail }],
    conferenceData: { createRequest: { requestId: `jva-meet-${booking.id}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    extendedProperties: { private: { jvaBookingId: String(booking.id) } },
  };
  const response = await fetch(`${endpoint}?conferenceDataVersion=1&sendUpdates=all`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let event = await response.json() as { error?: { message?: string }; hangoutLink?: string; conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> }; id?: string };
  if (response.status === 409) {
    const existing = await fetch(`${endpoint}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    event = await existing.json() as typeof event;
    if (!existing.ok) throw new CalendarSyncError(event.error?.message || "Unable to verify the existing Google Calendar event.");
  } else if (!response.ok) {
    throw new CalendarSyncError(event.error?.message || "Unable to create the Google Calendar event.");
  }
  const meetUrl = meetingLink(event);
  if (!meetUrl) throw new CalendarSyncError("Google Calendar created the event without a Meet link. Check conferencing permissions and retry.");
  const calendarEventId = event.id || id;
  const sentWithGmail = await sendGmailConfirmation(accessToken, calendarId, booking, meetUrl);
  if (!sentWithGmail) await sendCalendarConfirmation(accessToken, calendarId, calendarEventId, booking, meetUrl);
  return { calendarEventId, meetUrl, confirmationChannel: sentWithGmail ? "gmail" : "calendar-update" };
}

export async function deleteCalendarEvent(calendarEventId: string) {
  const { accessToken, calendarId } = await calendarAccess();
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(calendarEventId)}?sendUpdates=all`;
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (![204, 404, 410].includes(response.status)) {
    const data = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new CalendarSyncError(data.error?.message || "Unable to delete the Google Calendar event.");
  }
}
