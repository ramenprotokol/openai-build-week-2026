import { TurnRequestSchema, TurnResultSchema } from "../src/shared/agent-contract";
import { fallbackTurn } from "./fallback";
import { runLiveTurn } from "./live";

interface Env {
  ASSETS: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  LIVE_AI_ENABLED?: string;
}

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

const browserSecurityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self' data:",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: securityHeaders,
  });
}

function apiError(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

function withBrowserSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(browserSecurityHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (declaredLength > 12_000) throw new Error("PAYLOAD_TOO_LARGE");
  const text = await request.text();
  if (text.length > 12_000) throw new Error("PAYLOAD_TOO_LARGE");
  return JSON.parse(text);
}

async function handleTurn(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return apiError("METHOD_NOT_ALLOWED", "Use POST for agent turns.", 405);
  }
  if (!isSameOrigin(request)) {
    return apiError("ORIGIN_NOT_ALLOWED", "Cross-origin requests are not allowed.", 403);
  }
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return apiError("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    const code = error instanceof Error && error.message === "PAYLOAD_TOO_LARGE"
      ? "PAYLOAD_TOO_LARGE"
      : "INVALID_JSON";
    return apiError(code, code === "PAYLOAD_TOO_LARGE" ? "Request is too large." : "Request body is not valid JSON.", code === "PAYLOAD_TOO_LARGE" ? 413 : 400);
  }

  const parsed = TurnRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("INVALID_REQUEST", "The agent-turn contract was not satisfied.", 400);
  }

  const liveEnabled = env.LIVE_AI_ENABLED === "true" && Boolean(env.OPENAI_API_KEY);
  if (!liveEnabled) {
    return json(TurnResultSchema.parse(fallbackTurn(parsed.data)));
  }

  const timeout = AbortSignal.timeout(20_000);
  try {
    const result = await runLiveTurn(parsed.data, {
      apiKey: env.OPENAI_API_KEY!,
      model: env.OPENAI_MODEL ?? "gpt-5.6-sol",
      signal: timeout,
    });
    return json(TurnResultSchema.parse(result));
  } catch {
    return json(
      TurnResultSchema.parse(
        fallbackTurn(
          parsed.data,
          "The live model was unavailable, so this turn used the verified fallback.",
        ),
      ),
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        liveConfigured: env.LIVE_AI_ENABLED === "true" && Boolean(env.OPENAI_API_KEY),
        model: env.OPENAI_MODEL ?? "gpt-5.6-sol",
      });
    }

    if (url.pathname === "/api/turn") {
      return handleTurn(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return apiError("NOT_FOUND", "API route not found.", 404);
    }

    return withBrowserSecurityHeaders(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
