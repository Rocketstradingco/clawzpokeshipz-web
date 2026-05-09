// --- DISCORD LOGIC ---
async function sendDiscordMessage(env, { username, channelId, customMsg, mentionEveryone, isTest = false }) {
  if (!channelId || !env.DISCORD_TOKEN) throw new Error("Missing Discord configuration.");
  const content = `${mentionEveryone ? "@everyone " : ""}🚀 **${username}** ${customMsg}${isTest ? " (TEST NOTIFICATION)" : ""}`;
  return await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bot ${env.DISCORD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      embeds: [{
        title: `Watch ${username}'s Stream`,
        url: `https://www.tiktok.com/@${username}/live`,
        color: 16711680,
        timestamp: new Date().toISOString()
      }]
    })
  });
}

export default {
  // 1. API & Website Handler
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // --- API ENDPOINTS ---
    
    if (url.pathname === "/status") {
      const isLive = await env.STATUS_KV.get("isLive") === "true";
      return new Response(JSON.stringify({ isLive }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (url.pathname === "/admin/login" && request.method === "POST") {
      const { username, password } = await request.json();
      const ownerName = await env.STATUS_KV.get("admin_name") || "Claw";
      const ownerPass = await env.STATUS_KV.get("admin_pass") || "Claw69";
      if (username.toLowerCase() === ownerName.toLowerCase() && password === ownerPass) {
        return new Response(JSON.stringify({ success: true, user: ownerName, isFirstLogin: ownerPass === "Claw69" }), { headers: corsHeaders });
      }
      if (username.toLowerCase() === "rockets" && password === "pass123") {
        return new Response(JSON.stringify({ success: true, user: "Rockets", isFirstLogin: false }), { headers: corsHeaders });
      }
      return new Response(JSON.stringify({ success: false }), { status: 401, headers: corsHeaders });
    }

    if (url.pathname === "/admin/channels") {
      const guildId = await env.STATUS_KV.get("guild_id") || env.GUILD_ID;
      const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { "Authorization": `Bot ${env.DISCORD_TOKEN}` }
      });
      return new Response(await res.text(), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (url.pathname === "/admin/config" && request.method === "POST") {
      const config = await request.json();
      if (config.guildId) await env.STATUS_KV.put("guild_id", config.guildId);
      if (config.channelId) await env.STATUS_KV.put("channel_id", config.channelId);
      if (config.tiktokUsername) await env.STATUS_KV.put("tiktok_username", config.tiktokUsername);
      if (config.customMessage) await env.STATUS_KV.put("custom_message", config.customMessage);
      if (config.mentionEveryone !== undefined) await env.STATUS_KV.put("mention_everyone", config.mentionEveryone ? "true" : "false");
      return new Response("OK", { headers: corsHeaders });
    }

    if (url.pathname === "/admin/test-notify" && request.method === "POST") {
      const username = await env.STATUS_KV.get("tiktok_username") || "clawzpokeshipz";
      const channelId = await env.STATUS_KV.get("channel_id") || env.DISCORD_CHANNEL_ID;
      const customMsg = await env.STATUS_KV.get("custom_message") || "is now LIVE on TikTok!";
      const mentionEveryone = await env.STATUS_KV.get("mention_everyone") === "true";
      await sendDiscordMessage(env, { username, channelId, customMsg, mentionEveryone, isTest: true });
      return new Response("OK", { headers: corsHeaders });
    }

    // 2. Serve Static Assets (The Website)
    // This will serve your React app from the build output
    return env.ASSETS ? await env.ASSETS.fetch(request) : new Response("Website Assets not found. Ensure Cloudflare Assets is enabled.", { status: 404 });
  },

  // 3. TikTok Bot (Cron Trigger)
  async scheduled(event, env, ctx) {
    const username = await env.STATUS_KV.get("tiktok_username") || "clawzpokeshipz";
    const channelId = await env.STATUS_KV.get("channel_id") || env.DISCORD_CHANNEL_ID;
    const customMsg = await env.STATUS_KV.get("custom_message") || "is now LIVE on TikTok!";
    const mentionEveryone = await env.STATUS_KV.get("mention_everyone") === "true";
    
    try {
      const response = await fetch(`https://www.tiktok.com/@${username}/live`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
      });
      const html = await response.text();
      const isCurrentlyLive = html.includes('"status":2') || html.includes('room_id') || html.includes('title="LIVE"');
      const wasLive = await env.STATUS_KV.get("isLive") === "true";

      if (isCurrentlyLive && !wasLive) {
        await env.STATUS_KV.put("isLive", "true");
        await sendDiscordMessage(env, { username, channelId, customMsg, mentionEveryone });
      } else if (!isCurrentlyLive && wasLive) {
        await env.STATUS_KV.put("isLive", "false");
      }
    } catch (err) {
      console.error("Bot Error:", err.message);
    }
  }
};
