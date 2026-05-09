type StatusKv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

type Env = {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  STATUS_KV?: StatusKv;
  DISCORD_TOKEN?: string;
  DISCORD_CHANNEL_ID?: string;
  GUILD_ID?: string;
  TIKTOK_USERNAME?: string;
  WORKER_UPDATE_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  SECONDARY_ADMIN_USERNAME?: string;
  SECONDARY_ADMIN_PASSWORD?: string;
};

type DiscordMessageOptions = {
  username: string;
  channelId: string;
  customMsg: string;
  mentionEveryone: boolean;
  isTest?: boolean;
};

type StoredConfig = {
  guildId: string;
  channelId: string;
  tiktokUsername: string;
  tiktokLink: string;
  customMessage: string;
  mentionEveryone: boolean;
};

const DEFAULT_TIKTOK_USERNAME = "clawzpokeshipz";
const DEFAULT_ADMIN_NAME = "Claw";
const DEFAULT_ADMIN_PASSWORD = "Claw69";
const DEFAULT_CUSTOM_MESSAGE = "is now LIVE on TikTok!";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

const baseCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

class HttpError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "SERVER_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function withCors(headers: HeadersInit = {}) {
  return { ...baseCorsHeaders, ...headers };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors({ "Content-Type": "application/json" }),
  });
}

function textResponse(message: string, status = 200) {
  return new Response(message, { status, headers: withCors() });
}

function requireKv(env: Env) {
  if (!env.STATUS_KV) {
    throw new HttpError("The KV Namespace binding 'STATUS_KV' is missing.", 500, "DATABASE_MISSING");
  }

  return env.STATUS_KV;
}

async function readJsonBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return await request.json();
  } catch {
    throw new HttpError("Expected a JSON request body.", 400, "BAD_JSON");
  }
}

function normalizeTikTokUsername(username: unknown) {
  const normalized = String(username || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
    .replace(/\/live\/?$/i, "")
    .replace(/\/.*$/, "");

  return normalized || DEFAULT_TIKTOK_USERNAME;
}

function liveUrlFor(username: string) {
  return `https://www.tiktok.com/@${username}/live`;
}

async function getStoredConfig(env: Env): Promise<StoredConfig> {
  const kv = requireKv(env);
  const tiktokUsername = normalizeTikTokUsername(
    (await kv.get("tiktok_username")) || env.TIKTOK_USERNAME || DEFAULT_TIKTOK_USERNAME,
  );

  return {
    guildId: (await kv.get("guild_id")) || env.GUILD_ID || "",
    channelId: (await kv.get("channel_id")) || env.DISCORD_CHANNEL_ID || "",
    tiktokUsername,
    tiktokLink: liveUrlFor(tiktokUsername),
    customMessage: (await kv.get("custom_message")) || DEFAULT_CUSTOM_MESSAGE,
    mentionEveryone: (await kv.get("mention_everyone")) === "true",
  };
}

async function putOrDelete(kv: StatusKv, key: string, value: unknown) {
  const text = String(value || "").trim();
  if (text) {
    await kv.put(key, text);
  } else {
    await kv.delete(key);
  }
}

async function requireAdmin(request: Request, env: Env) {
  const kv = requireKv(env);
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!token) {
    throw new HttpError("Missing admin session.", 401, "UNAUTHORIZED");
  }

  const user = await kv.get(`admin_session:${token}`);
  if (!user) {
    throw new HttpError("Admin session expired. Please log in again.", 401, "SESSION_EXPIRED");
  }

  await kv.put(`admin_session:${token}`, user, { expirationTtl: SESSION_TTL_SECONDS });
  return { token, user };
}

async function sendDiscordMessage(env: Env, options: DiscordMessageOptions) {
  const token = env.DISCORD_TOKEN;
  if (!token) {
    throw new HttpError("DISCORD_TOKEN is missing in Cloudflare secrets.", 500, "DISCORD_TOKEN_MISSING");
  }

  if (!options.channelId) {
    throw new HttpError("No Discord channel is configured.", 400, "DISCORD_CHANNEL_MISSING");
  }

  const content = `${options.mentionEveryone ? "@everyone " : ""}\uD83D\uDE80 **${options.username}** ${options.customMsg}${options.isTest ? " (TEST NOTIFICATION)" : ""}`;
  const response = await fetch(`https://discord.com/api/v10/channels/${options.channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content,
      allowed_mentions: options.mentionEveryone ? { parse: ["everyone"] } : { parse: [] },
      embeds: [
        {
          title: `Watch ${options.username}'s Stream`,
          url: liveUrlFor(options.username),
          color: 16711680,
          timestamp: new Date().toISOString(),
          footer: { text: "ClawzPokeShipz Live Monitor" },
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(`Discord API returned ${response.status}: ${detail}`, 502, "DISCORD_API_ERROR");
  }
}

async function fetchTikTokLiveStatus(username: string) {
  const response = await fetch(liveUrlFor(username), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (response.status >= 500) {
    throw new HttpError(`TikTok returned ${response.status}.`, 502, "TIKTOK_UNAVAILABLE");
  }

  if (response.status === 404) {
    return false;
  }

  const html = await response.text();
  const offlineSignals = [
    /"status"\s*:\s*4\b/i,
    /"isLiving"\s*:\s*false/i,
    /couldn(?:'|&#x27;)?t find this account/i,
  ];

  if (offlineSignals.some((pattern) => pattern.test(html))) {
    return false;
  }

  const liveSignals = [
    /"status"\s*:\s*2\b/i,
    /"roomStatus"\s*:\s*2\b/i,
    /"liveStatus"\s*:\s*(1|2)\b/i,
    /"isLiving"\s*:\s*true/i,
    /"user_live_status"\s*:\s*2\b/i,
    /title="LIVE"/i,
  ];

  return liveSignals.some((pattern) => pattern.test(html));
}

async function updateStoredLiveStatus(env: Env, isLive: boolean, username: string, source: string) {
  const kv = requireKv(env);
  const now = new Date().toISOString();
  const previous = (await kv.get("isLive")) === "true";

  await kv.put("isLive", isLive ? "true" : "false");
  await kv.put("last_checked", now);
  await kv.put("last_status_source", source);
  await kv.put("tiktok_username", username);

  if (previous !== isLive) {
    await kv.put("last_live_change", now);
  }

  return previous;
}

async function handleLogin(request: Request, env: Env) {
  const kv = requireKv(env);
  const body = await readJsonBody<{ username?: string; password?: string }>(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const ownerName = (await kv.get("admin_name")) || env.ADMIN_USERNAME || DEFAULT_ADMIN_NAME;
  const ownerPass = (await kv.get("admin_pass")) || env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const secondaryName = env.SECONDARY_ADMIN_USERNAME || "rockets";
  const secondaryPass = env.SECONDARY_ADMIN_PASSWORD || (await kv.get("secondary_admin_pass")) || "";

  let matchedUser = "";
  let isFirstLogin = false;

  if (username.toLowerCase() === ownerName.toLowerCase() && password === ownerPass) {
    matchedUser = ownerName;
    isFirstLogin = ownerPass === DEFAULT_ADMIN_PASSWORD;
  } else if (secondaryPass && username.toLowerCase() === secondaryName.toLowerCase() && password === secondaryPass) {
    matchedUser = secondaryName;
  }

  if (!matchedUser) {
    return jsonResponse({ success: false, error: "Invalid username or password." }, 401);
  }

  const token = crypto.randomUUID();
  await kv.put(`admin_session:${token}`, matchedUser, { expirationTtl: SESSION_TTL_SECONDS });

  return jsonResponse({
    success: true,
    user: matchedUser,
    token,
    isFirstLogin,
    expiresIn: SESSION_TTL_SECONDS,
  });
}

async function handleUpdateProfile(request: Request, env: Env) {
  const session = await requireAdmin(request, env);
  const kv = requireKv(env);
  const ownerName = (await kv.get("admin_name")) || env.ADMIN_USERNAME || DEFAULT_ADMIN_NAME;

  if (session.user.toLowerCase() !== ownerName.toLowerCase()) {
    throw new HttpError("Only the primary admin can update the profile.", 403, "FORBIDDEN");
  }

  const body = await readJsonBody<{ currentPassword?: string; newPassword?: string; newName?: string }>(request);
  const storedPass = (await kv.get("admin_pass")) || env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  if (String(body.currentPassword || "") !== storedPass) {
    throw new HttpError("Current password is incorrect.", 401, "UNAUTHORIZED");
  }

  const newPassword = String(body.newPassword || "").trim();
  const newName = String(body.newName || "").trim();

  if (newPassword && newPassword.length < 6) {
    throw new HttpError("Password must be at least 6 characters.", 400, "WEAK_PASSWORD");
  }

  if (newPassword) await kv.put("admin_pass", newPassword);
  if (newName) await kv.put("admin_name", newName);
  if (newName) await kv.put(`admin_session:${session.token}`, newName, { expirationTtl: SESSION_TTL_SECONDS });

  return jsonResponse({ success: true, user: newName || ownerName });
}

async function handleChannels(request: Request, env: Env) {
  await requireAdmin(request, env);
  const kv = requireKv(env);
  const url = new URL(request.url);
  const guildId = url.searchParams.get("guildId")?.trim() || (await kv.get("guild_id")) || env.GUILD_ID || "";

  if (!env.DISCORD_TOKEN) {
    throw new HttpError("DISCORD_TOKEN is missing in Cloudflare secrets.", 500, "DISCORD_TOKEN_MISSING");
  }

  if (!guildId) {
    throw new HttpError("Enter a Discord Guild ID before fetching channels.", 400, "GUILD_ID_MISSING");
  }

  const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(`Discord API returned ${response.status}: ${text}`, 502, "DISCORD_API_ERROR");
  }

  return new Response(text, {
    headers: withCors({ "Content-Type": "application/json" }),
  });
}

async function handleSaveConfig(request: Request, env: Env) {
  await requireAdmin(request, env);
  const kv = requireKv(env);
  const body = await readJsonBody<Record<string, unknown>>(request);
  const username = normalizeTikTokUsername(body.tiktokUsername);

  await putOrDelete(kv, "guild_id", body.guildId);
  await putOrDelete(kv, "channel_id", body.channelId);
  await kv.put("tiktok_username", username);
  await putOrDelete(kv, "custom_message", body.customMessage || DEFAULT_CUSTOM_MESSAGE);
  await kv.put("mention_everyone", body.mentionEveryone ? "true" : "false");

  return jsonResponse({ success: true, config: await getStoredConfig(env) });
}

async function handleTestNotify(request: Request, env: Env) {
  await requireAdmin(request, env);
  const config = await getStoredConfig(env);

  await sendDiscordMessage(env, {
    username: config.tiktokUsername,
    channelId: config.channelId,
    customMsg: config.customMessage,
    mentionEveryone: config.mentionEveryone,
    isTest: true,
  });

  return jsonResponse({ success: true });
}

async function handleStatus(env: Env) {
  const kv = requireKv(env);
  const config = await getStoredConfig(env);

  return jsonResponse({
    isLive: (await kv.get("isLive")) === "true",
    username: config.tiktokUsername,
    liveUrl: config.tiktokLink,
    lastChecked: await kv.get("last_checked"),
    lastLiveChange: await kv.get("last_live_change"),
    lastError: await kv.get("last_error"),
    source: await kv.get("last_status_source"),
  });
}

async function handleExternalUpdate(request: Request, env: Env) {
  const body = await readJsonBody<{ secret?: string; live?: boolean; username?: string }>(request);

  if (!env.WORKER_UPDATE_SECRET || body.secret !== env.WORKER_UPDATE_SECRET) {
    throw new HttpError("Invalid update secret.", 401, "UNAUTHORIZED");
  }

  if (typeof body.live !== "boolean") {
    throw new HttpError("'live' must be a boolean.", 400, "BAD_REQUEST");
  }

  const username = normalizeTikTokUsername(body.username || env.TIKTOK_USERNAME || DEFAULT_TIKTOK_USERNAME);
  await updateStoredLiveStatus(env, body.live, username, "external_bot");

  return jsonResponse({ success: true, isLive: body.live, username });
}

async function runTikTokCheck(env: Env) {
  const config = await getStoredConfig(env);
  const kv = requireKv(env);

  try {
    const isCurrentlyLive = await fetchTikTokLiveStatus(config.tiktokUsername);
    const wasLive = await updateStoredLiveStatus(env, isCurrentlyLive, config.tiktokUsername, "cloudflare_cron");
    await kv.delete("last_error");

    if (isCurrentlyLive && !wasLive && config.channelId && env.DISCORD_TOKEN) {
      await sendDiscordMessage(env, {
        username: config.tiktokUsername,
        channelId: config.channelId,
        customMsg: config.customMessage,
        mentionEveryone: config.mentionEveryone,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await kv.put("last_checked", new Date().toISOString());
    await kv.put("last_error", message);
    console.error("TikTok check failed:", message);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: withCors() });
    }

    try {
      if (url.pathname === "/status" && request.method === "GET") {
        return await handleStatus(env);
      }

      if (url.pathname === "/update" && request.method === "POST") {
        return await handleExternalUpdate(request, env);
      }

      if (url.pathname === "/admin/login" && request.method === "POST") {
        return await handleLogin(request, env);
      }

      if (url.pathname === "/admin/config" && request.method === "GET") {
        await requireAdmin(request, env);
        return jsonResponse(await getStoredConfig(env));
      }

      if (url.pathname === "/admin/config" && request.method === "POST") {
        return await handleSaveConfig(request, env);
      }

      if (url.pathname === "/admin/update-profile" && request.method === "POST") {
        return await handleUpdateProfile(request, env);
      }

      if (url.pathname === "/admin/channels" && request.method === "GET") {
        return await handleChannels(request, env);
      }

      if (url.pathname === "/admin/test-notify" && request.method === "POST") {
        return await handleTestNotify(request, env);
      }

      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }

      return textResponse("Not Found", 404);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ error: error.code, message: error.message }, error.status);
      }

      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: "SERVER_ERROR", message }, 500);
    }
  },

  async scheduled(_event: unknown, env: Env, _ctx: unknown) {
    if (!env.STATUS_KV) {
      console.error("STATUS_KV binding is missing.");
      return;
    }

    await runTikTokCheck(env);
  },
};
