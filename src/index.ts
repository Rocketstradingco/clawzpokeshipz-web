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
  PRIMARY_ADMIN_DISCORD_ID?: string;
  SECONDARY_ADMIN_USERNAME?: string;
  SECONDARY_ADMIN_PASSWORD?: string;
  SECONDARY_ADMIN_DISCORD_ID?: string;
};

type AdminRole = "primary" | "secondary";

type AdminAccount = {
  role: AdminRole;
  username: string;
  password: string;
  discordId: string;
};

type AdminSession = {
  role: AdminRole;
  user: string;
  discordId?: string;
};

type DiscordMessageOptions = {
  username: string;
  channelId: string;
  customMsg: string;
  mentionEveryone: boolean;
  isTest?: boolean;
};

type TikTokWatchAccount = {
  username: string;
  liveUrl: string;
  customMessage: string;
  verifiedAt?: string | null;
};

type TikTokAccountStatus = TikTokWatchAccount & {
  isLive: boolean;
  lastChecked: string | null;
  lastLiveChange: string | null;
  lastError: string | null;
  lastNotifiedAt: string | null;
  notificationError: string | null;
  source: string | null;
};

type PublicStatusSnapshot = {
  isLive: boolean;
  username: string;
  liveUrl: string;
  lastChecked: string | null;
  lastLiveChange: string | null;
  lastError: string | null;
  source: string | null;
  tiktokAccounts: TikTokAccountStatus[];
  liveAccounts: TikTokAccountStatus[];
  homepageContent: HomepageContent;
};

type HomepageCard = {
  title: string;
  body: string;
};

type HomepageContent = {
  heroTitle: string;
  heroSubtitle: string;
  tiktokButtonLabel: string;
  discordButtonLabel: string;
  cards: HomepageCard[];
};

type DiscordGuild = {
  id: string;
  name: string;
  approximate_member_count?: number;
  approximate_presence_count?: number;
  premium_tier?: number;
  premium_subscription_count?: number;
};

type DiscordChannel = {
  id: string;
  name: string;
  type: number;
};

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator?: string;
  bot?: boolean;
};

type DiscordMember = {
  user?: DiscordUser;
  nick?: string | null;
  joined_at?: string | null;
};

type DiscordAuditLogEntry = {
  id: string;
  action_type: number;
  user_id?: string;
  target_id?: string | null;
  reason?: string | null;
};

type DiscordAuditLog = {
  audit_log_entries: DiscordAuditLogEntry[];
  users: DiscordUser[];
};

type StoredConfig = {
  guildId: string;
  guildName: string;
  channelId: string;
  channels: DiscordChannel[];
  channelsUpdatedAt: string | null;
  tiktokUsername: string;
  tiktokLink: string;
  customMessage: string;
  tiktokAccounts: TikTokWatchAccount[];
  mentionEveryone: boolean;
  homepageContent: HomepageContent;
};

const DEFAULT_TIKTOK_USERNAME = "clawzpokeshipz";
const DEFAULT_ADMIN_NAME = "Claw";
const DEFAULT_ADMIN_PASSWORD = "Claw69";
const DEFAULT_CUSTOM_MESSAGE = "is now LIVE on TikTok!";
const DEFAULT_TIKTOK_ACCOUNT: TikTokWatchAccount = {
  username: DEFAULT_TIKTOK_USERNAME,
  liveUrl: `https://www.tiktok.com/@${DEFAULT_TIKTOK_USERNAME}/live`,
  customMessage: DEFAULT_CUSTOM_MESSAGE,
  verifiedAt: null,
};
const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  heroTitle: "The PokeShipz Hub",
  heroSubtitle: "Catch pack openings, battles, and collector updates live on TikTok.",
  tiktokButtonLabel: "Visit TikTok",
  discordButtonLabel: "Join Discord",
  cards: [
    {
      title: "Live Streams",
      body: "Pack openings and battles from the live table.",
    },
    {
      title: "Community",
      body: "Discord updates when the TikTok stream goes live.",
    },
    {
      title: "Updates",
      body: "Collector drops, announcements, and schedule changes.",
    },
  ],
};
const DISCORD_MEMBER_AUDIT_ACTIONS: Record<number, string> = {
  20: "Member kicked",
  21: "Members pruned",
  22: "Member banned",
  23: "Member unbanned",
  24: "Member updated",
  25: "Member roles changed",
  26: "Member moved",
  27: "Member disconnected",
  28: "Bot added",
};
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const STATUS_SNAPSHOT_KEY = "status_snapshot";
const MAX_TIKTOK_ACCOUNTS = 8;
const TIKTOK_FETCH_TIMEOUT_MS = 9000;
const TIKTOK_SCAN_LIMIT = 900_000;
const TIKTOK_REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

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

function parseTikTokUsername(username: unknown) {
  return String(username || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
    .replace(/\/live\/?$/i, "")
    .replace(/\/.*$/, "");
}

function normalizeTikTokUsername(username: unknown) {
  return parseTikTokUsername(username) || DEFAULT_TIKTOK_USERNAME;
}

function liveUrlFor(username: string) {
  return `https://www.tiktok.com/@${username}/live`;
}

function profileUrlFor(username: string) {
  return `https://www.tiktok.com/@${username}`;
}

function normalizeTikTokAccounts(value: unknown, fallbackUsername?: unknown, fallbackMessage?: unknown): TikTokWatchAccount[] {
  const rawAccounts = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const accounts = rawAccounts
    .map((raw) => {
      const account = raw && typeof raw === "object" ? (raw as Partial<TikTokWatchAccount>) : {};
      const username = parseTikTokUsername(account.username);
      return {
        username,
        liveUrl: liveUrlFor(username),
        customMessage: textOrDefault(account.customMessage, String(fallbackMessage || DEFAULT_CUSTOM_MESSAGE), 220),
        verifiedAt: typeof account.verifiedAt === "string" ? account.verifiedAt : null,
      };
    })
    .filter((account) => {
      const key = account.username.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (accounts.length > 0) return accounts.slice(0, MAX_TIKTOK_ACCOUNTS);

  const username = normalizeTikTokUsername(fallbackUsername);
  return [
    {
      username,
      liveUrl: liveUrlFor(username),
      customMessage: textOrDefault(fallbackMessage, DEFAULT_CUSTOM_MESSAGE, 220),
      verifiedAt: null,
    },
  ];
}

function textOrDefault(value: unknown, fallback: string, maxLength = 180) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : fallback;
}

function normalizeHomepageContent(value: unknown): HomepageContent {
  const content = value && typeof value === "object" ? (value as Partial<HomepageContent>) : {};

  return {
    heroTitle: textOrDefault(content.heroTitle, DEFAULT_HOMEPAGE_CONTENT.heroTitle, 80),
    heroSubtitle: textOrDefault(content.heroSubtitle, DEFAULT_HOMEPAGE_CONTENT.heroSubtitle, 220),
    tiktokButtonLabel: textOrDefault(content.tiktokButtonLabel, DEFAULT_HOMEPAGE_CONTENT.tiktokButtonLabel, 40),
    discordButtonLabel: textOrDefault(content.discordButtonLabel, DEFAULT_HOMEPAGE_CONTENT.discordButtonLabel, 40),
    cards: DEFAULT_HOMEPAGE_CONTENT.cards.map((defaultCard, index) => {
      const card = Array.isArray(content.cards) ? content.cards[index] : undefined;
      return {
        title: textOrDefault(card?.title, defaultCard.title, 60),
        body: textOrDefault(card?.body, defaultCard.body, 180),
      };
    }),
  };
}

async function getStoredHomepageContent(kv: StatusKv) {
  const raw = await kv.get("homepage_content");
  if (!raw) return DEFAULT_HOMEPAGE_CONTENT;

  try {
    return normalizeHomepageContent(JSON.parse(raw));
  } catch {
    return DEFAULT_HOMEPAGE_CONTENT;
  }
}

async function getStoredTikTokAccounts(kv: StatusKv, fallbackUsername: string, fallbackMessage: string) {
  const raw = await kv.get("tiktok_accounts");
  if (!raw) return normalizeTikTokAccounts(null, fallbackUsername, fallbackMessage);

  try {
    return normalizeTikTokAccounts(JSON.parse(raw), fallbackUsername, fallbackMessage);
  } catch {
    return normalizeTikTokAccounts(null, fallbackUsername, fallbackMessage);
  }
}

function normalizeDiscordChannels(value: unknown): DiscordChannel[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((channel) => {
      const item = channel && typeof channel === "object" ? (channel as Partial<DiscordChannel>) : {};
      return {
        id: String(item.id || "").trim(),
        name: String(item.name || "").trim(),
        type: Number(item.type),
      };
    })
    .filter((channel) => channel.id && channel.name && Number.isFinite(channel.type));
}

async function getStoredDiscordChannels(kv: StatusKv) {
  const raw = await kv.get("discord_channels");
  if (!raw) return [];

  try {
    return normalizeDiscordChannels(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function getStoredConfig(env: Env): Promise<StoredConfig> {
  const kv = requireKv(env);
  const tiktokUsername = normalizeTikTokUsername(
    (await kv.get("tiktok_username")) || env.TIKTOK_USERNAME || DEFAULT_TIKTOK_USERNAME,
  );
  const customMessage = (await kv.get("custom_message")) || DEFAULT_CUSTOM_MESSAGE;
  const tiktokAccounts = await getStoredTikTokAccounts(kv, tiktokUsername, customMessage);
  const primaryAccount = tiktokAccounts[0] || DEFAULT_TIKTOK_ACCOUNT;
  const guildId = (await kv.get("guild_id")) || env.GUILD_ID || "";

  return {
    guildId,
    guildName: (await kv.get("discord_guild_name")) || "",
    channelId: (await kv.get("channel_id")) || env.DISCORD_CHANNEL_ID || "",
    channels: await getStoredDiscordChannels(kv),
    channelsUpdatedAt: await kv.get("discord_channels_updated_at"),
    tiktokUsername: primaryAccount.username,
    tiktokLink: primaryAccount.liveUrl,
    customMessage: primaryAccount.customMessage,
    tiktokAccounts,
    mentionEveryone: (await kv.get("mention_everyone")) === "true",
    homepageContent: await getStoredHomepageContent(kv),
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

async function getAdminAccounts(env: Env) {
  const kv = requireKv(env);
  const primary: AdminAccount = {
    role: "primary",
    username: (await kv.get("admin_name")) || env.ADMIN_USERNAME || DEFAULT_ADMIN_NAME,
    password: (await kv.get("admin_pass")) || env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,
    discordId: (await kv.get("primary_admin_discord_id")) || env.PRIMARY_ADMIN_DISCORD_ID || "",
  };
  const secondary: AdminAccount = {
    role: "secondary",
    username: (await kv.get("secondary_admin_name")) || env.SECONDARY_ADMIN_USERNAME || "rockets",
    password: (await kv.get("secondary_admin_pass")) || env.SECONDARY_ADMIN_PASSWORD || "",
    discordId: (await kv.get("secondary_admin_discord_id")) || env.SECONDARY_ADMIN_DISCORD_ID || "",
  };

  return { primary, secondary };
}

function serializeSession(account: AdminAccount): string {
  return JSON.stringify({
    role: account.role,
    user: account.username,
    discordId: account.discordId || undefined,
  } satisfies AdminSession);
}

function parseSession(raw: string, accounts: Awaited<ReturnType<typeof getAdminAccounts>>): AdminSession {
  try {
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (parsed.user && (parsed.role === "primary" || parsed.role === "secondary")) {
      return {
        role: parsed.role,
        user: parsed.user,
        discordId: parsed.discordId,
      };
    }
  } catch {
    // Older sessions stored the username as plain text.
  }

  const role = raw.toLowerCase() === accounts.primary.username.toLowerCase() ? "primary" : "secondary";
  const account = role === "primary" ? accounts.primary : accounts.secondary;
  return { role, user: raw, discordId: account.discordId || undefined };
}

async function requireAdmin(request: Request, env: Env) {
  const kv = requireKv(env);
  const accounts = await getAdminAccounts(env);
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!token) {
    throw new HttpError("Missing admin session.", 401, "UNAUTHORIZED");
  }

  const user = await kv.get(`admin_session:${token}`);
  if (!user) {
    throw new HttpError("Admin session expired. Please log in again.", 401, "SESSION_EXPIRED");
  }

  const session = parseSession(user, accounts);
  await kv.put(`admin_session:${token}`, user, { expirationTtl: SESSION_TTL_SECONDS });
  return { token, ...session };
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

function hasPattern(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function getTikTokCanonicalUsername(html: string) {
  const match = html.match(/"uniqueId"\s*:\s*"([^"]+)"/i);
  return match ? parseTikTokUsername(match[1]) : "";
}

function hasTikTokProfileSignals(html: string) {
  return Boolean(getTikTokCanonicalUsername(html)) || hasPattern(html, [
    /"secUid"\s*:\s*"[^"]+"/i,
    /"nickname"\s*:/i,
    /"followerCount"\s*:/i,
  ]);
}

function isMissingTikTokAccount(html: string) {
  if (hasTikTokProfileSignals(html)) return false;

  return hasPattern(html, [
    /couldn(?:'|&#x27;)?t find this account/i,
    /"statusCode"\s*:\s*10202/i,
    /"user"\s*:\s*null/i,
  ]);
}

function isTikTokChallengePage(html: string) {
  return hasPattern(html, [
    /captcha/i,
    /verify to continue/i,
    /unusual traffic/i,
    /access denied/i,
    /login-title/i,
  ]);
}

function detectTikTokLiveSignal(html: string): "live" | "offline" | "unknown" {
  const scan = html.slice(0, TIKTOK_SCAN_LIMIT);

  if (
    hasPattern(scan, [
      /"isLiving"\s*:\s*true/i,
      /"isLive"\s*:\s*true/i,
      /"roomStatus"\s*:\s*2\b/i,
      /"liveStatus"\s*:\s*(1|2)\b/i,
      /"user_live_status"\s*:\s*2\b/i,
      /"status"\s*:\s*2\b[^}]{0,500}"LiveRoom"/i,
      /title="LIVE"/i,
    ])
  ) {
    return "live";
  }

  if (
    hasPattern(scan, [
      /"isLiving"\s*:\s*false/i,
      /"roomStatus"\s*:\s*4\b/i,
      /"LiveRoom"[^}]{0,1200}"status"\s*:\s*4\b/i,
    ])
  ) {
    return "offline";
  }

  return "unknown";
}

async function fetchTikTokHtml(url: string) {
  const response = await fetch(url, {
    headers: TIKTOK_REQUEST_HEADERS,
    signal: AbortSignal.timeout(TIKTOK_FETCH_TIMEOUT_MS),
  });

  if (response.status === 404) {
    return { status: response.status, html: "" };
  }

  if (response.status === 403 || response.status === 429) {
    throw new HttpError(`TikTok blocked the check with ${response.status}.`, 502, "TIKTOK_BLOCKED");
  }

  if (response.status >= 500) {
    throw new HttpError(`TikTok returned ${response.status}.`, 502, "TIKTOK_UNAVAILABLE");
  }

  if (response.status >= 400) {
    throw new HttpError(`TikTok returned ${response.status}.`, 502, "TIKTOK_CHECK_FAILED");
  }

  return { status: response.status, html: await response.text() };
}

async function fetchTikTokLiveStatus(username: string, previousIsLive: boolean) {
  const urls = [liveUrlFor(username), profileUrlFor(username)];
  let foundUsablePage = false;
  let lastFetchError: Error | null = null;

  for (const url of urls) {
    let status = 0;
    let html = "";

    try {
      const result = await fetchTikTokHtml(url);
      status = result.status;
      html = result.html;
    } catch (error) {
      lastFetchError = error instanceof Error ? error : new Error(String(error));
      continue;
    }

    if (status === 404 || isMissingTikTokAccount(html)) return false;

    if (isTikTokChallengePage(html)) {
      lastFetchError = new HttpError("TikTok returned a challenge page, so the previous status was preserved.", 502, "TIKTOK_CHALLENGE");
      continue;
    }

    foundUsablePage = true;
    const detection = detectTikTokLiveSignal(html);
    if (detection === "live") return true;
    if (detection === "offline") return false;
  }

  if (!foundUsablePage && lastFetchError) {
    throw lastFetchError;
  }

  if (previousIsLive || !foundUsablePage) {
    throw new HttpError("TikTok did not return a decisive live/offline signal, so the previous status was preserved.", 502, "TIKTOK_AMBIGUOUS");
  }

  return false;
}

async function verifyTikTokAccount(usernameInput: unknown): Promise<TikTokWatchAccount> {
  const username = parseTikTokUsername(usernameInput);
  if (!username) {
    throw new HttpError("Enter a TikTok username.", 400, "TIKTOK_USERNAME_MISSING");
  }

  const response = await fetch(profileUrlFor(username), {
    headers: TIKTOK_REQUEST_HEADERS,
    signal: AbortSignal.timeout(TIKTOK_FETCH_TIMEOUT_MS),
  });

  if (response.status === 404) {
    throw new HttpError(`TikTok account @${username} was not found.`, 404, "TIKTOK_ACCOUNT_NOT_FOUND");
  }

  if (response.status === 403 || response.status === 429) {
    return {
      username,
      liveUrl: liveUrlFor(username),
      customMessage: DEFAULT_CUSTOM_MESSAGE,
      verifiedAt: new Date().toISOString(),
    };
  }

  if (response.status >= 500) {
    throw new HttpError(`TikTok returned ${response.status}. Try again in a minute.`, 502, "TIKTOK_UNAVAILABLE");
  }

  if (response.status >= 400) {
    throw new HttpError(`TikTok returned ${response.status} while checking @${username}.`, 502, "TIKTOK_VERIFY_FAILED");
  }

  const html = await response.text();
  const canonicalUsername = getTikTokCanonicalUsername(html) || username;

  if (!hasTikTokProfileSignals(html) && isMissingTikTokAccount(html)) {
    throw new HttpError(`TikTok account @${username} was not found.`, 404, "TIKTOK_ACCOUNT_NOT_FOUND");
  }

  return {
    username: canonicalUsername,
    liveUrl: liveUrlFor(canonicalUsername),
    customMessage: DEFAULT_CUSTOM_MESSAGE,
    verifiedAt: new Date().toISOString(),
  };
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function accountStatusFromRaw(account: TikTokWatchAccount, raw?: Partial<TikTokAccountStatus>): TikTokAccountStatus {
  return {
    ...account,
    isLive: Boolean(raw?.isLive),
    lastChecked: stringOrNull(raw?.lastChecked),
    lastLiveChange: stringOrNull(raw?.lastLiveChange),
    lastError: stringOrNull(raw?.lastError),
    lastNotifiedAt: stringOrNull(raw?.lastNotifiedAt),
    notificationError: stringOrNull(raw?.notificationError),
    source: stringOrNull(raw?.source),
  };
}

async function readStatusSnapshot(kv: StatusKv): Promise<PublicStatusSnapshot | null> {
  const raw = await kv.get(STATUS_SNAPSHOT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PublicStatusSnapshot>;
    const rawAccounts = Array.isArray(parsed.tiktokAccounts) ? parsed.tiktokAccounts : [];
    const accounts = normalizeTikTokAccounts(rawAccounts, parsed.username, DEFAULT_CUSTOM_MESSAGE);
    const statuses = accounts.map((account) => {
      const stored = rawAccounts.find(
        (item) =>
          item &&
          typeof item === "object" &&
          parseTikTokUsername((item as Partial<TikTokAccountStatus>).username).toLowerCase() ===
            account.username.toLowerCase(),
      ) as Partial<TikTokAccountStatus> | undefined;
      return accountStatusFromRaw(account, stored);
    });
    const liveAccounts = statuses.filter((status) => status.isLive);
    const primaryAccount = liveAccounts[0] || statuses[0] || DEFAULT_TIKTOK_ACCOUNT;

    return {
      isLive: typeof parsed.isLive === "boolean" ? parsed.isLive : liveAccounts.length > 0,
      username: primaryAccount.username,
      liveUrl: primaryAccount.liveUrl,
      lastChecked: stringOrNull(parsed.lastChecked),
      lastLiveChange: stringOrNull(parsed.lastLiveChange),
      lastError: stringOrNull(parsed.lastError),
      source: stringOrNull(parsed.source),
      tiktokAccounts: statuses,
      liveAccounts,
      homepageContent: normalizeHomepageContent(parsed.homepageContent),
    };
  } catch {
    return null;
  }
}

function statusesFromSnapshot(config: StoredConfig, snapshot: PublicStatusSnapshot | null) {
  const previousByUsername = new Map(
    (snapshot?.tiktokAccounts || []).map((status) => [status.username.toLowerCase(), status] as const),
  );

  return config.tiktokAccounts.map((account) => accountStatusFromRaw(account, previousByUsername.get(account.username.toLowerCase())));
}

function buildStatusSnapshot(
  config: StoredConfig,
  statuses: TikTokAccountStatus[],
  source: string,
  previousSnapshot: PublicStatusSnapshot | null,
  checkedAt: string | null,
): PublicStatusSnapshot {
  const liveAccounts = statuses.filter((status) => status.isLive);
  const primaryAccount = liveAccounts[0] || statuses[0] || DEFAULT_TIKTOK_ACCOUNT;
  const isLive = liveAccounts.length > 0;
  const statusErrors = statuses
    .flatMap((status) => [status.lastError, status.notificationError])
    .filter((message): message is string => Boolean(message));
  const lastLiveChange =
    previousSnapshot && previousSnapshot.isLive !== isLive
      ? checkedAt
      : previousSnapshot?.lastLiveChange || statuses.find((status) => status.lastLiveChange)?.lastLiveChange || null;

  return {
    isLive,
    username: primaryAccount.username,
    liveUrl: primaryAccount.liveUrl,
    lastChecked: checkedAt || previousSnapshot?.lastChecked || null,
    lastLiveChange,
    lastError: statusErrors.length > 0 ? statusErrors.map((message) => message.slice(0, 300)).join("; ").slice(0, 1000) : null,
    source,
    tiktokAccounts: statuses,
    liveAccounts,
    homepageContent: config.homepageContent,
  };
}

async function writeStatusSnapshot(kv: StatusKv, snapshot: PublicStatusSnapshot) {
  await kv.put(STATUS_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

async function handleLogin(request: Request, env: Env) {
  const kv = requireKv(env);
  const body = await readJsonBody<{ username?: string; password?: string }>(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const accounts = await getAdminAccounts(env);

  let matchedAccount: AdminAccount | undefined;
  let isFirstLogin = false;

  for (const account of [accounts.primary, accounts.secondary]) {
    if (account.password && username.toLowerCase() === account.username.toLowerCase() && password === account.password) {
      matchedAccount = account;
      isFirstLogin = account.role === "primary" && account.password === DEFAULT_ADMIN_PASSWORD;
      break;
    }
  }

  if (!matchedAccount) {
    return jsonResponse({ success: false, error: "Invalid username or password." }, 401);
  }

  const token = crypto.randomUUID();
  await kv.put(`admin_session:${token}`, serializeSession(matchedAccount), { expirationTtl: SESSION_TTL_SECONDS });

  return jsonResponse({
    success: true,
    user: matchedAccount.username,
    role: matchedAccount.role,
    discordId: matchedAccount.discordId || null,
    token,
    isFirstLogin,
    expiresIn: SESSION_TTL_SECONDS,
  });
}

async function handleUpdateProfile(request: Request, env: Env) {
  const session = await requireAdmin(request, env);
  const kv = requireKv(env);
  const accounts = await getAdminAccounts(env);
  const account = session.role === "primary" ? accounts.primary : accounts.secondary;
  const body = await readJsonBody<{ currentPassword?: string; newPassword?: string; newName?: string }>(request);

  if (String(body.currentPassword || "") !== account.password) {
    throw new HttpError("Current password is incorrect.", 401, "UNAUTHORIZED");
  }

  const newPassword = String(body.newPassword || "").trim();
  const newName = String(body.newName || "").trim();

  if (newPassword && newPassword.length < 6) {
    throw new HttpError("Password must be at least 6 characters.", 400, "WEAK_PASSWORD");
  }

  if (session.role === "primary") {
    if (newPassword) await kv.put("admin_pass", newPassword);
    if (newName) await kv.put("admin_name", newName);
  } else {
    if (newPassword) await kv.put("secondary_admin_pass", newPassword);
    if (newName) await kv.put("secondary_admin_name", newName);
  }

  const updatedAccount: AdminAccount = {
    ...account,
    username: newName || account.username,
    password: newPassword || account.password,
  };
  await kv.put(`admin_session:${session.token}`, serializeSession(updatedAccount), { expirationTtl: SESSION_TTL_SECONDS });

  return jsonResponse({ success: true, user: updatedAccount.username, role: updatedAccount.role });
}

async function fetchDiscordJson<T>(env: Env, path: string): Promise<T> {
  if (!env.DISCORD_TOKEN) {
    throw new HttpError("DISCORD_TOKEN is missing in Cloudflare secrets.", 500, "DISCORD_TOKEN_MISSING");
  }

  const response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bot ${env.DISCORD_TOKEN}` },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(`Discord API returned ${response.status}: ${detail}`, 502, "DISCORD_API_ERROR");
  }

  return (await response.json()) as T;
}

function displayDiscordUser(user?: DiscordUser) {
  if (!user) return "Unknown user";
  return user.global_name || user.username || user.id;
}

function isoFromDiscordSnowflake(id: string) {
  try {
    const timestamp = Number((BigInt(id) >> 22n) + 1420070400000n);
    return new Date(timestamp).toISOString();
  } catch {
    return null;
  }
}

async function resolveDiscordGuild(env: Env, kv: StatusKv, requestedGuildId = "") {
  if (requestedGuildId) {
    return { guildId: requestedGuildId, guildName: "" };
  }

  const storedGuildId = (await kv.get("guild_id")) || env.GUILD_ID || "";
  let guilds: DiscordGuild[] = [];

  try {
    guilds = await fetchDiscordJson<DiscordGuild[]>(env, "/users/@me/guilds?limit=200");
  } catch (error) {
    if (storedGuildId) {
      return { guildId: storedGuildId, guildName: "" };
    }

    throw error;
  }

  if (storedGuildId) {
    const storedGuild = guilds.find((guild) => guild.id === storedGuildId);
    if (storedGuild) {
      return { guildId: storedGuild.id, guildName: storedGuild.name };
    }
  }

  if (guilds.length === 1) {
    await kv.put("guild_id", guilds[0].id);
    return { guildId: guilds[0].id, guildName: guilds[0].name };
  }

  if (guilds.length === 0) {
    throw new HttpError("The bot is not installed in any Discord servers yet.", 400, "NO_BOT_GUILDS");
  }

  const guildChoices = guilds
    .slice(0, 5)
    .map((guild) => `${guild.name} (${guild.id})`)
    .join(", ");
  throw new HttpError(
    `The bot is in multiple Discord servers. Enter one Guild ID first: ${guildChoices}`,
    400,
    "GUILD_SELECTION_REQUIRED",
  );
}

async function resolveChannelsGuild(request: Request, env: Env, kv: StatusKv) {
  const url = new URL(request.url);
  return resolveDiscordGuild(env, kv, url.searchParams.get("guildId")?.trim() || "");
}

async function cacheDiscordChannels(env: Env, kv: StatusKv, guildId = "") {
  const guild = await resolveDiscordGuild(env, kv, guildId);
  const channels = await fetchDiscordJson<DiscordChannel[]>(env, `/guilds/${guild.guildId}/channels`);
  let guildName = guild.guildName || (await kv.get("discord_guild_name")) || "";
  const now = new Date().toISOString();

  if (!guildName) {
    try {
      const guildDetails = await fetchDiscordJson<DiscordGuild>(env, `/guilds/${guild.guildId}?with_counts=true`);
      guildName = guildDetails.name || "";
    } catch {
      // Channel cache is still useful if the guild name lookup fails.
    }
  }

  await kv.put("guild_id", guild.guildId);
  if (guildName) await kv.put("discord_guild_name", guildName);
  await kv.put("discord_channels", JSON.stringify(normalizeDiscordChannels(channels)));
  await kv.put("discord_channels_updated_at", now);

  return {
    guildId: guild.guildId,
    guildName,
    channels,
    channelsUpdatedAt: now,
  };
}

async function handleChannels(request: Request, env: Env) {
  await requireAdmin(request, env);
  const kv = requireKv(env);
  const url = new URL(request.url);
  const channelCache = await cacheDiscordChannels(env, kv, url.searchParams.get("guildId")?.trim() || "");

  return jsonResponse({
    guildId: channelCache.guildId,
    guildName: channelCache.guildName,
    channels: channelCache.channels,
    channelsUpdatedAt: channelCache.channelsUpdatedAt,
  });
}

async function handleDiscordStatus(request: Request, env: Env) {
  await requireAdmin(request, env);
  const kv = requireKv(env);
  const guild = await resolveChannelsGuild(request, env, kv);
  const [bot, guildDetails, channels] = await Promise.all([
    fetchDiscordJson<DiscordUser>(env, "/users/@me"),
    fetchDiscordJson<DiscordGuild>(env, `/guilds/${guild.guildId}?with_counts=true`),
    fetchDiscordJson<DiscordChannel[]>(env, `/guilds/${guild.guildId}/channels`),
  ]);

  let recentMembers: Array<{ id: string; name: string; joinedAt: string | null; bot: boolean }> = [];
  let memberListError = "";

  try {
    const members = await fetchDiscordJson<DiscordMember[]>(env, `/guilds/${guild.guildId}/members?limit=50`);
    recentMembers = members
      .filter((member) => member.user?.id)
      .sort((a, b) => String(b.joined_at || "").localeCompare(String(a.joined_at || "")))
      .slice(0, 10)
      .map((member) => ({
        id: member.user?.id || "",
        name: member.nick || displayDiscordUser(member.user),
        joinedAt: member.joined_at || null,
        bot: Boolean(member.user?.bot),
      }));
  } catch (error) {
    memberListError =
      error instanceof Error
        ? error.message
        : "Could not read guild members. The bot may need the Server Members intent enabled.";
  }

  let auditEvents: Array<{
    id: string;
    action: string;
    actor: string;
    target: string;
    reason: string | null;
    createdAt: string | null;
  }> = [];
  let auditLogError = "";

  try {
    const auditLog = await fetchDiscordJson<DiscordAuditLog>(env, `/guilds/${guild.guildId}/audit-logs?limit=30`);
    const usersById = new Map(auditLog.users.map((user) => [user.id, user]));
    auditEvents = auditLog.audit_log_entries
      .filter((entry) => DISCORD_MEMBER_AUDIT_ACTIONS[entry.action_type])
      .slice(0, 10)
      .map((entry) => ({
        id: entry.id,
        action: DISCORD_MEMBER_AUDIT_ACTIONS[entry.action_type],
        actor: displayDiscordUser(entry.user_id ? usersById.get(entry.user_id) : undefined),
        target: displayDiscordUser(entry.target_id ? usersById.get(entry.target_id) : undefined),
        reason: entry.reason || null,
        createdAt: isoFromDiscordSnowflake(entry.id),
      }));
  } catch (error) {
    auditLogError = error instanceof Error ? error.message : "Could not read the Discord audit log.";
  }

  await kv.put("guild_id", guild.guildId);

  return jsonResponse({
    bot: {
      id: bot.id,
      username: bot.username,
      displayName: displayDiscordUser(bot),
    },
    guild: {
      id: guild.guildId,
      name: guild.guildName || guildDetails.name,
      memberCount: guildDetails.approximate_member_count ?? null,
      presenceCount: guildDetails.approximate_presence_count ?? null,
      premiumTier: guildDetails.premium_tier ?? 0,
      boosts: guildDetails.premium_subscription_count ?? 0,
      channelCount: channels.length,
      textChannelCount: channels.filter((channel) => channel.type === 0).length,
      announcementChannelCount: channels.filter((channel) => channel.type === 5).length,
      voiceChannelCount: channels.filter((channel) => channel.type === 2).length,
      categoryCount: channels.filter((channel) => channel.type === 4).length,
    },
    recentMembers,
    auditEvents,
    memberListError,
    auditLogError,
  });
}

async function handleVerifyTikTokAccount(request: Request, env: Env) {
  await requireAdmin(request, env);
  const body = await readJsonBody<{ username?: string; customMessage?: string }>(request);
  const account = await verifyTikTokAccount(body.username);

  return jsonResponse({
    success: true,
    account: {
      ...account,
      customMessage: textOrDefault(body.customMessage, DEFAULT_CUSTOM_MESSAGE, 220),
    },
  });
}

async function handleSaveConfig(request: Request, env: Env) {
  await requireAdmin(request, env);
  const kv = requireKv(env);
  const body = await readJsonBody<Record<string, unknown>>(request);
  const existingConfig = await getStoredConfig(env);
  const accounts = normalizeTikTokAccounts(body.tiktokAccounts, body.tiktokUsername, body.customMessage);
  const primaryAccount = accounts[0] || DEFAULT_TIKTOK_ACCOUNT;
  const guildId = String(body.guildId || "").trim() || existingConfig.guildId;
  const channelId = String(body.channelId || "").trim() || existingConfig.channelId;

  await putOrDelete(kv, "guild_id", guildId);
  await putOrDelete(kv, "channel_id", channelId);
  await kv.put("tiktok_username", primaryAccount.username);
  await putOrDelete(kv, "custom_message", primaryAccount.customMessage || DEFAULT_CUSTOM_MESSAGE);
  await kv.put("tiktok_accounts", JSON.stringify(accounts));
  await kv.put("mention_everyone", body.mentionEveryone ? "true" : "false");
  await kv.put("homepage_content", JSON.stringify(normalizeHomepageContent(body.homepageContent)));

  const savedConfig = await getStoredConfig(env);
  const previousSnapshot = await readStatusSnapshot(kv);
  const snapshot = buildStatusSnapshot(savedConfig, statusesFromSnapshot(savedConfig, previousSnapshot), "config", previousSnapshot, new Date().toISOString());
  await writeStatusSnapshot(kv, snapshot);

  return jsonResponse({ success: true, config: savedConfig });
}

async function handleTestNotify(request: Request, env: Env) {
  await requireAdmin(request, env);
  const config = await getStoredConfig(env);

  for (const account of config.tiktokAccounts) {
    await sendDiscordMessage(env, {
      username: account.username,
      channelId: config.channelId,
      customMsg: account.customMessage,
      mentionEveryone: config.mentionEveryone,
      isTest: true,
    });
  }

  return jsonResponse({ success: true, count: config.tiktokAccounts.length });
}

async function handleStatus(env: Env) {
  const kv = requireKv(env);
  const snapshot = await readStatusSnapshot(kv);
  if (snapshot) return jsonResponse(snapshot);

  const config = await getStoredConfig(env);
  return jsonResponse(buildStatusSnapshot(config, statusesFromSnapshot(config, null), "startup", null, null));
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
  const kv = requireKv(env);
  const config = await getStoredConfig(env);
  const configuredAccount = config.tiktokAccounts.find((item) => item.username.toLowerCase() === username.toLowerCase());
  const account =
    configuredAccount || {
      username,
      liveUrl: liveUrlFor(username),
      customMessage: DEFAULT_CUSTOM_MESSAGE,
      verifiedAt: null,
    };
  const effectiveConfig = configuredAccount
    ? config
    : {
        ...config,
        tiktokAccounts: [account, ...config.tiktokAccounts].slice(0, MAX_TIKTOK_ACCOUNTS),
      };
  const previousSnapshot = await readStatusSnapshot(kv);
  const now = new Date().toISOString();
  const statuses = statusesFromSnapshot(effectiveConfig, previousSnapshot).map((status) => {
    if (status.username.toLowerCase() !== account.username.toLowerCase()) return status;

    return {
      ...status,
      ...account,
      isLive: body.live,
      lastChecked: now,
      lastLiveChange: status.isLive !== body.live ? now : status.lastLiveChange,
      lastError: null,
      notificationError: body.live ? status.notificationError : null,
      source: "external_bot",
    };
  });
  await writeStatusSnapshot(kv, buildStatusSnapshot(effectiveConfig, statuses, "external_bot", previousSnapshot, now));

  return jsonResponse({ success: true, isLive: body.live, username });
}

async function runTikTokCheck(env: Env) {
  const config = await getStoredConfig(env);
  const kv = requireKv(env);
  const previousSnapshot = await readStatusSnapshot(kv);
  const previousStatuses = statusesFromSnapshot(config, previousSnapshot);
  const previousByUsername = new Map(previousStatuses.map((status) => [status.username.toLowerCase(), status] as const));
  const statuses: TikTokAccountStatus[] = [];
  const checkedAt = new Date().toISOString();

  for (const account of config.tiktokAccounts) {
    const previousStatus = previousByUsername.get(account.username.toLowerCase()) || accountStatusFromRaw(account);

    try {
      const isCurrentlyLive = await fetchTikTokLiveStatus(account.username, previousStatus.isLive);
      const nextStatus: TikTokAccountStatus = {
        ...previousStatus,
        ...account,
        isLive: isCurrentlyLive,
        lastChecked: checkedAt,
        lastLiveChange: previousStatus.isLive !== isCurrentlyLive ? checkedAt : previousStatus.lastLiveChange,
        lastError: null,
        notificationError: isCurrentlyLive ? previousStatus.notificationError : null,
        source: "cloudflare_cron",
      };
      const shouldNotify =
        isCurrentlyLive &&
        (!previousStatus.isLive || Boolean(previousStatus.notificationError)) &&
        (config.channelId || !previousStatus.isLive);

      if (shouldNotify) {
        if (!config.channelId) {
          nextStatus.notificationError = "No Discord notification channel is configured.";
        } else if (!env.DISCORD_TOKEN) {
          nextStatus.notificationError = "DISCORD_TOKEN is missing in Cloudflare secrets.";
        } else {
          try {
            await sendDiscordMessage(env, {
              username: account.username,
              channelId: config.channelId,
              customMsg: account.customMessage,
              mentionEveryone: config.mentionEveryone,
            });
            nextStatus.lastNotifiedAt = checkedAt;
            nextStatus.notificationError = null;
          } catch (error) {
            nextStatus.notificationError = error instanceof Error ? error.message : String(error);
            console.error(`Discord notification failed for @${account.username}:`, nextStatus.notificationError);
          }
        }
      }

      statuses.push(nextStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      statuses.push({
        ...previousStatus,
        ...account,
        lastChecked: checkedAt,
        lastError: message,
        source: "cloudflare_cron",
      });
      console.error(`TikTok check failed for @${account.username}:`, message);
    }
  }

  await writeStatusSnapshot(kv, buildStatusSnapshot(config, statuses, "cloudflare_cron", previousSnapshot, checkedAt));
}

function getChicagoDayHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    day: `${values.year}-${values.month}-${values.day}`,
    hour: values.hour || "",
  };
}

async function refreshDiscordChannelsAtMidnight(env: Env) {
  const kv = requireKv(env);
  const { day, hour } = getChicagoDayHour();

  if (hour !== "00") return;
  if ((await kv.get("discord_channels_refresh_day")) === day) return;

  try {
    await cacheDiscordChannels(env, kv);
    await kv.put("discord_channels_refresh_day", day);
    await kv.delete("discord_channels_refresh_error");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await kv.put("discord_channels_refresh_error", message.slice(0, 1000));
    console.error("Discord channel cache refresh failed:", message);
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

      if (url.pathname === "/admin/discord-status" && request.method === "GET") {
        return await handleDiscordStatus(request, env);
      }

      if (url.pathname === "/admin/tiktok/verify" && request.method === "POST") {
        return await handleVerifyTikTokAccount(request, env);
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

    await Promise.all([runTikTokCheck(env), refreshDiscordChannelsAtMidnight(env)]);
  },
};
