export default {
  // This handles the automatic TikTok check every minute
  async scheduled(event, env, ctx) {
    const username = await env.STATUS_KV.get("tiktok_username") || "clawzpokeshipz";
    const channelId = await env.STATUS_KV.get("channel_id") || env.DISCORD_CHANNEL_ID;
    const customMsg = await env.STATUS_KV.get("custom_message") || "is now LIVE on TikTok!";
    const mentionEveryone = await env.STATUS_KV.get("mention_everyone") === "true";
    
    console.log(`Checking TikTok status for: ${username}`);

    try {
      // Check TikTok Live Status
      const response = await fetch(`https://www.tiktok.com/@${username}/live`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" }
      });
      const html = await response.text();
      
      const isCurrentlyLive = html.includes('"status":2') || html.includes('LIVE');
      const wasLive = await env.STATUS_KV.get("isLive") === "true";

      if (isCurrentlyLive && !wasLive) {
        // Just went LIVE
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
      } else if (!isCurrentlyLive && wasLive) {
        // Went OFFLINE
        await env.STATUS_KV.put("isLive", "false");
      }
    } catch (err) {
      console.error("TikTok check failed:", err.message);
    }
  },

  // Dummy fetch for Cloudflare dashboard compatibility
  async fetch(request, env) {
    return new Response("Bot is running. Monitoring is handled via Cron Trigger.");
  }
};
