
const ALLOWED_ORIGINS = [
  "https://yallcode.github.io"
];

function getAllowedOrigins(env) {
  const configured = (env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  return configured.length ? configured : ALLOWED_ORIGINS;
}

function corsHeaders(origin, env) {
  const allowed = getAllowedOrigins(env);

  if (!origin || !allowed.includes(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin, env)
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);
    const path = url.pathname;

    const allowed = getAllowedOrigins(env);

    // Reject unauthorized browser origins.
    if (origin && !allowed.includes(origin)) {
      return json({ error: "Origin not allowed." }, 403, "", env);
    }

    // Handle browser preflight requests before authentication.
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, env)
      });
    }

    // Health endpoint.
    if (path === "/health" && request.method === "GET") {
      return json({
        status: "online",
        service: "Claude Unlimited API",
        provider: "Anthropic",
        version: "3.0.0"
      }, 200, origin, env);
    }

    // Chat endpoint.
    if (path !== "/chat" || request.method !== "POST") {
      return json({
        error: "Not found.",
        endpoints: ["/health", "/chat"]
      }, 404, origin, env);
    }

    // Required configuration.
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return json({
        error: "Supabase configuration is missing on the Worker."
      }, 500, origin, env);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({
        error: "Anthropic API key is missing on the Worker."
      }, 503, origin, env);
    }

    // Verify the user's Supabase session.
    const authorization = request.headers.get("Authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
      return json({
        error: "Sign in is required."
      }, 401, origin, env);
    }

    try {
      const authCheck = await fetch(
        `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`,
        {
          headers: {
            "apikey": env.SUPABASE_ANON_KEY,
            "Authorization": authorization
          }
        }
      );

      if (!authCheck.ok) {
        return json({
          error: "Your session is invalid or expired. Sign in again."
        }, 401, origin, env);
      }

      // Read and validate request body.
      const rawBody = await request.text();

      if (new TextEncoder().encode(rawBody).length > 150000) {
        return json({
          error: "Request is too large. Maximum size is 150 KB."
        }, 413, origin, env);
      }

      let body;

      try {
        body = JSON.parse(rawBody);
      } catch {
        return json({
          error: "Invalid JSON request."
        }, 400, origin, env);
      }

      const {
        provider,
        model,
        system,
        messages
      } = body || {};

      // This Worker currently supports Anthropic only.
      if (provider !== "Anthropic") {
        return json({
          error: "This Worker currently supports Anthropic only."
        }, 400, origin, env);
      }

      if (
        typeof model !== "string" ||
        !/^[a-zA-Z0-9._:-]{1,100}$/.test(model)
      ) {
        return json({
          error: "Invalid model ID."
        }, 400, origin, env);
      }

      if (
        !Array.isArray(messages) ||
        messages.length < 1 ||
        messages.length > 40
      ) {
        return json({
          error: "Send between 1 and 40 messages."
        }, 400, origin, env);
      }

      const cleanMessages = messages.map(message => ({
        role: message?.role === "assistant" ? "assistant" : "user",
        content: typeof message?.content === "string"
          ? message.content.slice(0, 50000)
          : ""
      })).filter(message => message.content.trim());

      if (!cleanMessages.length) {
        return json({
          error: "Message content is empty."
        }, 400, origin, env);
      }

      const systemText =
        typeof system === "string" && system.trim()
          ? system.slice(0, 10000)
          : "You are a helpful AI assistant.";

      // Connect to Anthropic.
      const upstream = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: systemText,
            messages: cleanMessages
          })
        }
      );

      const payload = await upstream.json();

      if (!upstream.ok) {
        console.error("Anthropic API error:", upstream.status);

        return json({
          error: payload.error?.message ||
            "Anthropic request failed.",
          status: upstream.status
        }, upstream.status, origin, env);
      }

      const content = (payload.content || [])
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n");

      return json({
        content,
        model: payload.model || model,
        provider: "Anthropic",
        usage: payload.usage || null
      }, 200, origin, env);

    } catch (error) {
      console.error("Worker request failed:", error.message);

      return json({
        error: "Provider connection failed. Please try again."
      }, 502, origin, env);
    }
  }
};
