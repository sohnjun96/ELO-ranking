const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function badRequest(message, details = null) {
  return json({ ok: false, error: message, details }, 400);
}

export function notFound(message = "Not found") {
  return json({ ok: false, error: message }, 404);
}

export function methodNotAllowed(message = "Method not allowed") {
  return json({ ok: false, error: message }, 405, { allow: "GET,POST,PATCH,DELETE" });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
