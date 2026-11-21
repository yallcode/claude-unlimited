const json = (data, status, origin) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  }
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(x => x.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return json({error:"Origin not allowed."}, 403, "null");
    if (request.method === "OPTIONS") return new Response(null, {
      status:204,
      headers:{
        "Access-Control-Allow-Origin":origin,
        "Access-Control-Allow-Methods":"POST, OPTIONS",
        "Access-Control-Allow-Headers":"Content-Type, Authorization",
        "Access-Control-Max-Age":"86400",
        "Vary":"Origin"
      }
    });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/chat")
      return json({error:"Not found."},404,origin);
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer "))
      return json({error:"Sign in is required."},401,origin);
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
      return json({error:"Worker authentication is not configured."},500,origin);

    // Verify the access token with Supabase Auth. Never trust a user ID supplied by the browser.
    const authCheck = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers:{"apikey":env.SUPABASE_ANON_KEY,"Authorization":authorization}
    });
    if (!authCheck.ok) return json({error:"Your session is invalid or expired. Sign in again."},401,origin);

    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 150000) return json({error:"Request is too large (150 KB maximum)."},413,origin);
    let body;
    try { body = await request.json(); } catch { return json({error:"Invalid JSON request."},400,origin); }

    const {provider,model,system,messages} = body || {};
    if (!["Anthropic","OpenAI"].includes(provider))
      return json({error:"Unsupported provider."},400,origin);
    if (typeof model !== "string" || !/^[a-zA-Z0-9._:-]{1,100}$/.test(model))
      return json({error:"Invalid model ID."},400,origin);
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40)
      return json({error:"Send between 1 and 40 messages."},400,origin);
    const cleanMessages = messages.map(m => ({
      role:m?.role === "assistant" ? "assistant" : "user",
      content:typeof m?.content === "string" ? m.content.slice(0,50000) : ""
    })).filter(m=>m.content);
    if (!cleanMessages.length) return json({error:"Message content is empty."},400,origin);
    const systemText = typeof system === "string" ? system.slice(0,10000) : "You are a helpful assistant.";

    try {
      let upstream, payload;
      if (provider === "Anthropic") {
        if (!env.ANTHROPIC_API_KEY) return json({error:"Anthropic API key is not configured on the Worker."},503,origin);
        upstream = await fetch("https://api.anthropic.com/v1/messages", {
          method:"POST",
          headers:{
            "x-api-key":env.ANTHROPIC_API_KEY,
            "anthropic-version":"2023-06-01",
            "content-type":"application/json"
          },
          body:JSON.stringify({
            model, max_tokens:4096, system:systemText,
            messages:cleanMessages.map(m=>({role:m.role,content:m.content}))
          })
        });
        payload = await upstream.json();
        if (!upstream.ok) return json({error:payload.error?.message || "Anthropic request failed."},upstream.status,origin);
        return json({content:(payload.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n")},200,origin);
      } else {
        if (!env.OPENAI_API_KEY) return json({error:"OpenAI API key is not configured on the Worker."},503,origin);
        upstream = await fetch("https://api.openai.com/v1/chat/completions", {
          method:"POST",
          headers:{"Authorization":`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
          body:JSON.stringify({
            model, max_tokens:4096,
            messages:[{role:"system",content:systemText},...cleanMessages]
          })
        });
        payload = await upstream.json();
        if (!upstream.ok) return json({error:payload.error?.message || "OpenAI request failed."},upstream.status,origin);
        return json({content:payload.choices?.[0]?.message?.content || ""},200,origin);
      }
    } catch (error) {
      return json({error:"Provider connection failed. Please try again."},502,origin);
    }
  }
};
