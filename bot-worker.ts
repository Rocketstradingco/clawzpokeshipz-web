// This function is the "Source of Truth" for sending Discord messages.
// It is used by both the automatic bot and the manual "Test Notify" button.
async function sendDiscordMessage(env, { username, channelId, customMsg, mentionEveryone, isTest = false }) {
  if (!channelId || !env.DISCORD_TOKEN) {
    throw new Error("Missing Discord configuration (Channel ID or Token).");
  }

  const content = `${mentionEveryone ? "@everyone " : ""}🚀 **${username}** ${customMsg}${isTest ? " (TEST NOTIFICATION)" : ""}`;

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
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
        timestamp: new Date().toISOString(),
        footer: { text: "ClawzPokeShipz Live Monitor" }
      }]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Discord API Error: ${JSON.stringify(error)}`);
  }

  return response;
}

export default {
  // This handles the automatic TikTok check every 5 minutes (configured in wrangler.jsonc)
  async scheduled(event, env, ctx) {
    const username = await env.STATUS_KV.get("tiktok_username") || "clawzpokeshipz";
    const channelId = await env.STATUS_KV.get("channel_id") || env.DISCORD_CHANNEL_ID;
    const customMsg = await env.STATUS_KV.get("custom_message") || "is now LIVE on TikTok!";
    const mentionEveryone = await env.STATUS_KV.get("mention_everyone") === "true";
    
    console.log(`[Cron] Checking TikTok status for: ${username}`);

    try {
      // Robust TikTok Live check using User-Agent and specific patterns
      const response = await fetch(`https://www.tiktok.com/@${username}/live`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
      });
      const html = await response.text();
      
      // TikTok uses "status":2 or room_id being present to indicate live. 
      // Also looking for the "LIVE" text as a fallback.
      const isCurrentlyLive = html.includes('"status":2') || html.includes('room_id') || html.includes('title="LIVE"');
      const wasLive = await env.STATUS_KV.get("isLive") === "true";

      if (isCurrentlyLive && !wasLive) {
        console.log(`[Cron] ${username} just went LIVE. Sending notification.`);
        await env.STATUS_KV.put("isLive", "true");
        await sendDiscordMessage(env, { username, channelId, customMsg, mentionEveryone });
      } else if (!isCurrentlyLive && wasLive) {
        console.log(`[Cron] ${username} went offline.`);
        await env.STATUS_KV.put("isLive", "false");
      }
    } catch (err) {
      console.error("[Cron Error]:", err.message);
    }
  },

  // Dummy fetch for compatibility
  async fetch(request, env) {
    return new Response("Bot worker is active. Polling is handled via Cron Triggers.");
  }
};
