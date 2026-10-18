declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    JVA_PORTAL_PASSWORD?: string;
    JVA_SESSION_SECRET?: string;
  }
}
