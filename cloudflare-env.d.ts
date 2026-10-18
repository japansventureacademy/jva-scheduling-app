declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BUCKET?: R2Bucket;
    JVA_PORTAL_PASSWORD?: string;
    JVA_SESSION_SECRET?: string;
    JVA_PRESIDENT_EMAIL?: string;
    JVA_PARTNERSHIP_LEAD_EMAIL?: string;
    JVA_MARKETING_LEAD_EMAIL?: string;
    JVA_LAB_LEAD_EMAIL?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_REFRESH_TOKEN?: string;
    GOOGLE_CALENDAR_ID?: string;
  }
}
