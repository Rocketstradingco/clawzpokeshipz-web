export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. Website Status Check
    if (url.pathname === "/status") {
      const isLive = await env.STATUS_KV.get("isLive") === "true";
      return new Response(JSON.stringify({ isLive }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Admin Login
    if (url.pathname === "/admin/login" && request.method === "POST") {
      const { password } = await request.json();
      const storedPass = await env.STATUS_KV.get("admin_pass") || "Claw69";
      
      if (password === storedPass) {
        return new Response(JSON.stringify({ success: true, isFirstLogin: storedPass === "Claw69" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ success: false }), { status: 401, headers: corsHeaders });
    }

    // 3. Update Password
    if (url.pathname === "/admin/update-pass" && request.method === "POST") {
      const { currentPassword, newPassword } = await request.json();
      const storedPass = await env.STATUS_KV.get("admin_pass") || "Claw69";

      if (currentPassword !== storedPass) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }

      await env.STATUS_KV.put("admin_pass", newPassword);
      return new Response("OK", { headers: corsHeaders });
    }

    // 4. Fetch Discord Channels
    if (url.pathname === "/admin/channels") {
      const guildId = await env.STATUS_KV.get("guild_id") || env.GUILD_ID;
      if (!guildId) return new Response("Guild ID not configured", { status: 400, headers: corsHeaders });

      try {
        const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
          headers: { "Authorization": `Bot ${env.DISCORD_TOKEN}` }
        });
        const channels = await response.json();
        return new Response(JSON.stringify(channels), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(err.message, { status: 500, headers: corsHeaders });
      }
    }

    // 5. Save Configuration
    if (url.pathname === "/admin/config" && request.method === "POST") {
      const config = await request.json();
      if (config.guildId) await env.STATUS_KV.put("guild_id", config.guildId);
      if (config.channelId) await env.STATUS_KV.put("channel_id", config.channelId);
      if (config.tiktokUsername) await env.STATUS_KV.put("tiktok_username", config.tiktokUsername);
      if (config.customMessage) await env.STATUS_KV.put("custom_message", config.customMessage);
      if (config.mentionEveryone !== undefined) await env.STATUS_KV.put("mention_everyone", config.mentionEveryone ? "true" : "false");
      return new Response("OK", { headers: corsHeaders });
    }

    // 6. Test Notification
    if (url.pathname === "/admin/test-notify" && request.method === "POST") {
      const username = await env.STATUS_KV.get("tiktok_username") || "clawzpokeshipz";
      const channelId = await env.STATUS_KV.get("channel_id") || env.DISCORD_CHANNEL_ID;
      const customMsg = await env.STATUS_KV.get("custom_message") || "is now LIVE on TikTok!";
      const mentionEveryone = await env.STATUS_KV.get("mention_everyone") === "true";
      
      const content = `${mentionEveryone ? "@everyone " : ""}🚀 **${username}** ${customMsg}`;

      try {
        const discordRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bot ${env.DISCORD_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            content: content,
            embeds: [{
              title: `Watch ${username}'s Stream`,
              url: `https://www.tiktok.com/@${username}/live`,
              color: 16711680,
              timestamp: new Date().toISOString()
            }]
          })
        });
        
        if (!discordRes.ok) {
          const errorData = await discordRes.json();
          return new Response(JSON.stringify(errorData), { status: discordRes.status, headers: corsHeaders });
        }

        return new Response("Test notification sent!", { headers: corsHeaders });
      } catch (err) {
        return new Response(err.message, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },

  // --- CRON TRIGGER HANDLER ---
  async scheduled(event, env, ctx) {
    const username = await env.STATUS_KV.get("tiktok_username") || "clawzpokeshipz";
    const channelId = await env.STATUS_KV.get("channel_id") || env.DISCORD_CHANNEL_ID;
    const customMsg = await env.STATUS_KV.get("custom_message") || "is now LIVE on TikTok!";
    const mentionEveryone = await env.STATUS_KV.get("mention_everyone") === "true";
    
    console.log(`Checking TikTok status for: ${username}`);

    try {
      const response = await fetch(`https://www.tiktok.com/@${username}/live`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" }
      });
      const html = await response.text();
      
      const isCurrentlyLive = html.includes('"status":2') || html.includes('LIVE');
      const wasLive = await env.STATUS_KV.get("isLive") === "true";

      if (isCurrentlyLive && !wasLive) {
        await env.STATUS_KV.put("isLive", "true");
        
        if (channelId && env.DISCORD_TOKEN) {
          const content = `${mentionEveryone ? "@everyone " : ""}🚀 **${username}** ${customMsg}`;
          await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: "POST",
            headers: {
              "Authorization": `Bot ${env.DISCORD_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              content: content,
              embeds: [{
                title: `Watch ${username}'s Stream`,
                url: `https://www.tiktok.com/@${username}/live`,
                color: 16711680,
                timestamp: new Date().toISOString()
              }]
            })
          });
        }
      } else if (!isCurrentlyLive && wasLive) {
        await env.STATUS_KV.put("isLive", "false");
      }
    } catch (err) {
      console.error("Cron failed:", err.message);
    }
  }
};
