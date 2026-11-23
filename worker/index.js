
const ALLOWED_ORIGINS = ["https://yallcode.github.io"];

function getAllowedOrigins(env) {
  const configured = (env.ALLOWED_ORIGIN || "").split(",").map(v => v.trim()).filter(Boolean);
  return configured.length ? configured : ALLOWED_ORIGINS;
}

function corsHeaders(origin, env) {
  if (!origin || !getAllowedOrigins(env).includes(origin)) return {};
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

    if (origin && !allowed.includes(origin)) {
      return json({error:"Origin not allowed."},403,"",env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null,{
        status:204,
        headers:corsHeaders(origin,env)
      });
    }

    if (path === "/health" && request.method === "GET") {
      return json({
        status:"online",
        service:"Claude-inspired free-first AI workspace",
        inAppProvider:"Gemini free tier",
        claude:"Official Claude opens separately at claude.ai",
        version:"4.0.0"
      },200,origin,env);
    }

    if (path !== "/chat" || request.method !== "POST") {
      return json({
        error:"Not found.",
        endpoints:["/health","/chat"]
      },404,origin,env);
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
      return json({
        error:"Supabase configuration is missing on the Worker."
      },500,origin,env);
    }

    if (!env.GEMINI_API_KEY) {
      return json({
        error:"Gemini API key is missing. Add GEMINI_API_KEY as a Cloudflare Worker Secret."
      },503,origin,env);
    }

    const authorization = request.headers.get("Authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
      return json({error:"Sign in is required."},401,origin,env);
    }

    try {
      const authCheck = await fetch(
        `${env.SUPABASE_URL.replace(/\/$/,"")}/auth/v1/user`,
        {
          headers:{
            "apikey":env.SUPABASE_ANON_KEY,
            "Authorization":authorization
          }
        }
      );

      if (!authCheck.ok) {
        return json({
          error:"Your session is invalid or expired. Sign in again."
        },401,origin,env);
      }

      const rawBody = await request.text();

      if (new TextEncoder().encode(rawBody).length > 150000) {
        return json({
          error:"Request is too large. Maximum size is 150 KB."
        },413,origin,env);
      }

      let body;

      try {
        body = JSON.parse(rawBody);
      } catch {
        return json({error:"Invalid JSON request."},400,origin,env);
      }

      const {provider,model,system,messages} = body || {};

      if (provider !== "Gemini") {
        return json({
          error:"This free-first Worker only supports Gemini in-app. Open official Claude using the Open Claude button."
        },400,origin,env);
      }

      // Only permit this configured model.
      const allowedModel = "gemini-3.8-flash";

      if (model !== allowedModel) {
        return json({
          error:"This Worker only permits gemini-3.8-flash. Select the free-tier model in settings."
        },400,origin,env);
      }

      if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40) {
        return json({
          error:"Send between 1 and 40 messages."
        },400,origin,env);
      }

      const cleanMessages = messages.map(m => ({
        role:m?.role === "assistant" ? "model" : "user",
        parts:[{
          text:typeof m?.content === "string"
            ? m.content.slice(0,50000)
            : ""
        }]
      })).filter(m => m.parts[0].text.trim());

      if (!cleanMessages.length) {
        return json({error:"Message content is empty."},400,origin,env);
      }

      const systemText = typeof system === "string" && system.trim()
        ? system.slice(0,10000)
        : "You are a helpful, accurate AI assistant.";

      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${allowedModel}:generateContent`,
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "x-goog-api-key":env.GEMINI_API_KEY
          },
          body:JSON.stringify({
            systemInstruction:{
              parts:[{text:systemText}]
            },
            contents:cleanMessages,
            generationConfig:{
              maxOutputTokens:4096,
              temperature:0.7
            }
          })
        }
      );

      const payload = await upstream.json().catch(()=>({}));

      if (!upstream.ok) {
        const message = payload.error?.message || "Gemini request failed.";

        console.error(
          "Gemini API error:",
          upstream.status,
          message
        );

        return json({
          error:message,
          status:upstream.status
        },upstream.status,origin,env);
      }

      const content = (
        payload.candidates?.[0]?.content?.parts || []
      )
        .map(part => part.text || "")
        .join("\n")
        .trim();

      if (!content) {
        return json({
          error:"Gemini returned no text. The response may have been blocked or empty."
        },502,origin,env);
      }

      return json({
        content,
        model:allowedModel,
        provider:"Gemini",
        usage:payload.usageMetadata || null
      },200,origin,env);

    } catch (error) {
      console.error(
        "Worker request failed:",
        error?.message || error
      );

      return json({
        error:"Provider connection failed. Please try again."
      },502,origin,env);
    }
  }
};
