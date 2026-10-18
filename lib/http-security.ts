const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

export function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return Response.json(body, { ...init, headers });
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(request.url).origin;

  // Browsers send Sec-Fetch-Site even when Origin is omitted. Requests without
  // either header remain available to non-browser clients and are protected by
  // the same authentication checks as browser requests.
  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

export async function readJson<T>(request: Request, maxBytes = 16_384): Promise<T> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new RequestBodyError("Content-Type must be application/json", 415);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new RequestBodyError("Request body is too large", 413);

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RequestBodyError("Request body is too large", 413);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestBodyError("Request body must be valid JSON", 400);
  }
}

export class RequestBodyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
