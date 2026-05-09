export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Endpoint for the Website to check status
    if (url.pathname === "/status") {
      const isLive = await env.STATUS_KV.get("isLive") === "true";
      return new Response(JSON.stringify({ isLive }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" // Allows your website to talk to the worker
        }
      });
    }

    // 2. Endpoint for your Railway Bot to update status
    // Secure this with a simple secret key
    if (url.pathname === "/update" && request.method === "POST") {
      const { secret, live } = await request.json();
      
      if (secret !== env.UPDATE_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      await env.STATUS_KV.put("isLive", live ? "true" : "false");
      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  }
};
