import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Bot,
  ExternalLink,
  LayoutDashboard,
  Lock,
  LogOut,
  Radio,
  RefreshCw,
  Send,
  Server,
  Settings,
  Users,
} from 'lucide-react';

type Channel = { id: string; name: string; type: number };

type ChannelResponse = {
  guildId: string;
  guildName?: string;
  channels: Channel[];
};

type DiscordSummary = {
  bot: {
    id: string;
    username: string;
    displayName: string;
  };
  guild: {
    id: string;
    name: string;
    memberCount: number | null;
    presenceCount: number | null;
    boosts: number;
    channelCount: number;
    textChannelCount: number;
    announcementChannelCount: number;
    voiceChannelCount: number;
    categoryCount: number;
  };
  recentMembers: Array<{
    id: string;
    name: string;
    joinedAt: string | null;
    bot: boolean;
  }>;
  auditEvents: Array<{
    id: string;
    action: string;
    actor: string;
    target: string;
    reason: string | null;
    createdAt: string | null;
  }>;
  memberListError?: string;
  auditLogError?: string;
};

type StatusPayload = {
  isLive: boolean;
  username?: string;
  liveUrl?: string;
  lastChecked?: string | null;
  source?: string | null;
  homepageContent?: HomepageContent;
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

type ConfigPayload = {
  guildId: string;
  channelId: string;
  tiktokUsername: string;
  tiktokLink: string;
  customMessage: string;
  mentionEveryone: boolean;
  homepageContent?: HomepageContent;
};

const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  heroTitle: 'The PokeShipz Hub',
  heroSubtitle: 'Catch pack openings, battles, and collector updates live on TikTok.',
  tiktokButtonLabel: 'Visit TikTok',
  discordButtonLabel: 'Join Discord',
  cards: [
    {
      title: 'Live Streams',
      body: 'Pack openings and battles from the live table.',
    },
    {
      title: 'Community',
      body: 'Discord updates when the TikTok stream goes live.',
    },
    {
      title: 'Updates',
      body: 'Collector drops, announcements, and schedule changes.',
    },
  ],
};

function normalizeHomepageContent(content?: Partial<HomepageContent> | null): HomepageContent {
  return {
    heroTitle: content?.heroTitle || DEFAULT_HOMEPAGE_CONTENT.heroTitle,
    heroSubtitle: content?.heroSubtitle || DEFAULT_HOMEPAGE_CONTENT.heroSubtitle,
    tiktokButtonLabel: content?.tiktokButtonLabel || DEFAULT_HOMEPAGE_CONTENT.tiktokButtonLabel,
    discordButtonLabel: content?.discordButtonLabel || DEFAULT_HOMEPAGE_CONTENT.discordButtonLabel,
    cards: DEFAULT_HOMEPAGE_CONTENT.cards.map((defaultCard, index) => ({
      title: content?.cards?.[index]?.title || defaultCard.title,
      body: content?.cards?.[index]?.body || defaultCard.body,
    })),
  };
}

async function parseApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

function formatCheckedAt(value?: string | null) {
  if (!value) return 'Not checked yet';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Unknown time';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function App() {
  const [isLive, setIsLive] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [statusSource, setStatusSource] = useState<string | null>(null);
  const [view, setView] = useState<'home' | 'login' | 'dashboard'>('home');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');

  const [guildId, setGuildId] = useState('');
  const [guildName, setGuildName] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [discordSummary, setDiscordSummary] = useState<DiscordSummary | null>(null);
  const [discordSummaryError, setDiscordSummaryError] = useState('');
  const [tiktokUsername, setTiktokUsername] = useState('clawzpokeshipz');
  const [tiktokLink, setTiktokLink] = useState('https://www.tiktok.com/@clawzpokeshipz/live');
  const [customMessage, setCustomMessage] = useState('is now LIVE on TikTok!');
  const [mentionEveryone, setMentionEveryone] = useState(false);
  const [homepageContent, setHomepageContent] = useState<HomepageContent>(DEFAULT_HOMEPAGE_CONTENT);
  const [isBusy, setIsBusy] = useState(false);

  const applyConfig = useCallback((config: ConfigPayload) => {
    setGuildId(config.guildId || '');
    setGuildName('');
    setSelectedChannel(config.channelId || '');
    setTiktokUsername(config.tiktokUsername || 'clawzpokeshipz');
    setTiktokLink(config.tiktokLink || `https://www.tiktok.com/@${config.tiktokUsername || 'clawzpokeshipz'}/live`);
    setCustomMessage(config.customMessage || 'is now LIVE on TikTok!');
    setMentionEveryone(Boolean(config.mentionEveryone));
    setHomepageContent(normalizeHomepageContent(config.homepageContent));
  }, []);

  const apiRequest = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      if (adminToken) {
        headers.set('Authorization', `Bearer ${adminToken}`);
      }

      const response = await fetch(path, { ...options, headers });
      const payload = await parseApiResponse(response);

      if (!response.ok) {
        const message =
          typeof payload === 'object' && payload && 'message' in payload
            ? String(payload.message)
            : `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      return payload;
    },
    [adminToken],
  );

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/status');
        const data = (await parseApiResponse(response)) as StatusPayload;

        if (response.ok) {
          setIsLive(Boolean(data.isLive));
          setLastChecked(data.lastChecked || null);
          setStatusSource(data.source || null);
          if (data.username) setTiktokUsername(data.username);
          if (data.liveUrl) setTiktokLink(data.liveUrl);
          if (data.homepageContent) setHomepageContent(normalizeHomepageContent(data.homepageContent));
        }
      } catch (err) {
        console.error('Failed to fetch live status:', err);
      }
    };

    checkStatus();
    const interval = window.setInterval(checkStatus, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!adminToken || view !== 'dashboard') return;

    apiRequest('/admin/config')
      .then((payload) => applyConfig(payload as ConfigPayload))
      .catch((err) => alert(`Could not load configuration: ${err.message}`));
  }, [adminToken, apiRequest, applyConfig, view]);

  const handleLogin = async () => {
    setIsBusy(true);
    try {
      const response = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await parseApiResponse(response);

      if (!response.ok || typeof data !== 'object' || !data || !('success' in data) || !data.success) {
        const message = typeof data === 'object' && data && 'message' in data ? String(data.message) : 'Invalid credentials';
        throw new Error(message);
      }

      const loginData = data as { user: string; token: string; isFirstLogin: boolean };
      setAdminName(loginData.user);
      setAdminToken(loginData.token);
      setIsFirstLogin(loginData.isFirstLogin);
      setIsLoggedIn(true);
      setNewName(loginData.user);
      setView('dashboard');
    } catch (err) {
      alert(`Login failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleProfileUpdate = async () => {
    if (newPassword && newPassword.length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }

    setIsBusy(true);
    try {
      const data = (await apiRequest('/admin/update-profile', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: password,
          newPassword: newPassword || undefined,
          newName: newName || undefined,
        }),
      })) as { user?: string };

      if (newPassword) setPassword(newPassword);
      if (data.user) setAdminName(data.user);
      setIsFirstLogin(false);
      setNewPassword('');
      alert('Profile updated.');
    } catch (err) {
      alert(`Failed to update profile: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const fetchChannels = async () => {
    setIsBusy(true);
    try {
      const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : '';
      const data = (await apiRequest(`/admin/channels${query}`)) as Channel[] | ChannelResponse;
      const nextChannels = Array.isArray(data) ? data : data.channels;

      if (!Array.isArray(data)) {
        setGuildId(data.guildId);
        setGuildName(data.guildName || '');
      }

      setChannels(nextChannels.filter((channel) => channel.type === 0 || channel.type === 5));
    } catch (err) {
      alert(`Could not fetch channels: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const fetchDiscordSummary = async () => {
    setIsBusy(true);
    setDiscordSummaryError('');
    try {
      const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : '';
      const data = (await apiRequest(`/admin/discord-status${query}`)) as DiscordSummary;
      setDiscordSummary(data);
      setGuildId(data.guild.id);
      setGuildName(data.guild.name);
    } catch (err) {
      setDiscordSummary(null);
      setDiscordSummaryError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const saveConfig = async () => {
    setIsBusy(true);
    try {
      const data = (await apiRequest('/admin/config', {
        method: 'POST',
        body: JSON.stringify({
          guildId,
          channelId: selectedChannel,
          tiktokUsername,
          customMessage,
          mentionEveryone,
          homepageContent,
        }),
      })) as { config: ConfigPayload };

      applyConfig(data.config);
      alert('Configuration saved.');
    } catch (err) {
      alert(`Failed to save configuration: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const testNotify = async () => {
    setIsBusy(true);
    try {
      await apiRequest('/admin/test-notify', { method: 'POST' });
      alert('Test notification sent to Discord.');
    } catch (err) {
      alert(`Failed to send test notification: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setAdminToken('');
    setAdminName('');
    setPassword('');
    setNewPassword('');
    setView('home');
  };

  const handleTikTokUsernameChange = (value: string) => {
    const normalized = value.replace(/^@+/, '').trim();
    setTiktokUsername(normalized);
    setTiktokLink(`https://www.tiktok.com/@${normalized || 'clawzpokeshipz'}/live`);
  };

  const updateHomepageField = (field: keyof Omit<HomepageContent, 'cards'>, value: string) => {
    setHomepageContent((current) => ({ ...current, [field]: value }));
  };

  const updateHomepageCard = (index: number, field: keyof HomepageCard, value: string) => {
    setHomepageContent((current) => ({
      ...current,
      cards: current.cards.map((card, cardIndex) => (cardIndex === index ? { ...card, [field]: value } : card)),
    }));
  };

  return (
    <div className="container">
      <div className="banner-container" aria-label="ClawzPokeShipz animated logo">
        <div className="banner-stage">
          <div className="claw-cable" aria-hidden="true"></div>
          <img src="/logo.png" alt="ClawzPokeShipz Logo" className="banner-image banner-base" />
          <img src="/claw-overlay.png" alt="" className="banner-claw" aria-hidden="true" />
        </div>
      </div>

      <header>
        <div
          className="logo-area"
          onClick={() => setView('home')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') setView('home');
          }}
          role="button"
          tabIndex={0}
        >
          <div className="pokeball-icon"></div>
          <h1>ClawzPokeShipz</h1>
        </div>
        <div className="nav-actions">
          {isLive && (
            <div className="live-badge">
              <Radio size={16} className="blink" />
              <span>LIVE NOW</span>
            </div>
          )}
          {!isLoggedIn ? (
            <button className="btn-icon" onClick={() => setView('login')} title="Admin Login" type="button">
              <Lock size={20} />
            </button>
          ) : (
            <button className="btn-icon" onClick={() => setView('dashboard')} title="Dashboard" type="button">
              <LayoutDashboard size={20} />
            </button>
          )}
        </div>
      </header>

      <main>
        {view === 'home' && (
          <section className="hero">
            <div className={`stream-status ${isLive ? 'online' : 'offline'}`}>
              <span>{isLive ? 'Live on TikTok' : 'Currently offline'}</span>
              <small>{formatCheckedAt(lastChecked)}{statusSource ? ` via ${statusSource.replace('_', ' ')}` : ''}</small>
            </div>
            <h2>{homepageContent.heroTitle}</h2>
            <p>{homepageContent.heroSubtitle}</p>
            <div className="cta-buttons">
              <a href={tiktokLink} target="_blank" rel="noreferrer" className="btn btn-primary">
                <ExternalLink size={20} />
                {homepageContent.tiktokButtonLabel}
              </a>
              <a href="https://discord.gg/9JVNTanBEP" target="_blank" rel="noreferrer" className="btn btn-secondary">
                <Send size={20} />
                {homepageContent.discordButtonLabel}
              </a>
            </div>
          </section>
        )}

        {view === 'login' && (
          <section className="admin-box">
            <div className="terminal-header">ADMIN ACCESS PORTAL</div>
            <div className="terminal-body">
              <div className="input-group">
                <span className="prompt">USER:</span>
                <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoFocus />
              </div>
              <div className="input-group">
                <span className="prompt">PASS:</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleLogin()}
                />
              </div>
              <button className="btn btn-primary mt-20" onClick={handleLogin} disabled={isBusy} type="button">
                AUTHORIZE
              </button>
            </div>
          </section>
        )}

        {view === 'dashboard' && isLoggedIn && (
          <section className="admin-box dashboard">
            <div className="terminal-header">PC STORAGE SYSTEM - ADMIN: {adminName.toUpperCase()}</div>
            <div className="terminal-body">
              {isFirstLogin ? (
                <div className="reset-flow">
                  <h3>SECURITY ALERT: TEMPORARY PASSWORD DETECTED</h3>
                  <p>Please set permanent administrative credentials.</p>
                  <input
                    type="text"
                    placeholder="Display Name"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="New Password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <button className="btn btn-primary" onClick={handleProfileUpdate} disabled={isBusy} type="button">
                    UPDATE SECURITY KEY
                  </button>
                </div>
              ) : (
                <div className="dashboard-grid">
                  <div className="admin-section">
                    <h3>
                      <Bell size={18} /> NOTIFICATION SETTINGS
                    </h3>
                    <div className="field">
                      <label>Discord Bot Installation</label>
                      <a
                        href="https://discord.com/oauth2/authorize?client_id=1502495245026201690&permissions=8&scope=bot"
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-small"
                      >
                        Add Bot to Server
                      </a>
                    </div>

                    <div className="field">
                      <label>Guild (Server) ID</label>
                      <input
                        type="text"
                        value={guildId}
                        onChange={(event) => setGuildId(event.target.value)}
                        placeholder="Leave blank to use the bot server"
                      />
                      {guildName && <small className="field-note">Using {guildName}</small>}
                      <button className="btn btn-secondary btn-small" onClick={fetchChannels} disabled={isBusy} type="button">
                        Fetch Bot Server Channels
                      </button>
                    </div>

                    <div className="field">
                      <label>Target Channel</label>
                      <select value={selectedChannel} onChange={(event) => setSelectedChannel(event.target.value)}>
                        <option value="">Select a channel...</option>
                        {channels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            #{channel.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="admin-subsection discord-insights">
                      <h3>
                        <Server size={18} /> DISCORD SERVER
                      </h3>
                      <button className="btn btn-secondary btn-small" onClick={fetchDiscordSummary} disabled={isBusy} type="button">
                        <RefreshCw size={15} /> Check Bot Connection
                      </button>
                      {discordSummaryError && <p className="admin-alert">{discordSummaryError}</p>}
                      {discordSummary && (
                        <div className="discord-summary">
                          <div className="discord-identity">
                            <div>
                              <span>Bot</span>
                              <strong>
                                <Bot size={16} /> {discordSummary.bot.displayName}
                              </strong>
                            </div>
                            <div>
                              <span>Server</span>
                              <strong>
                                <Users size={16} /> {discordSummary.guild.name}
                              </strong>
                            </div>
                          </div>

                          <div className="discord-stat-grid">
                            <div>
                              <span>Members</span>
                              <strong>{discordSummary.guild.memberCount ?? 'Unknown'}</strong>
                            </div>
                            <div>
                              <span>Online</span>
                              <strong>{discordSummary.guild.presenceCount ?? 'Unknown'}</strong>
                            </div>
                            <div>
                              <span>Channels</span>
                              <strong>{discordSummary.guild.channelCount}</strong>
                            </div>
                            <div>
                              <span>Boosts</span>
                              <strong>{discordSummary.guild.boosts}</strong>
                            </div>
                          </div>

                          <div className="discord-breakdown">
                            <span>{discordSummary.guild.textChannelCount} text</span>
                            <span>{discordSummary.guild.announcementChannelCount} announcement</span>
                            <span>{discordSummary.guild.voiceChannelCount} voice</span>
                            <span>{discordSummary.guild.categoryCount} categories</span>
                          </div>

                          <div className="discord-lists">
                            <div>
                              <h4>Recent Joins</h4>
                              {discordSummary.recentMembers.length > 0 ? (
                                <ul>
                                  {discordSummary.recentMembers.map((member) => (
                                    <li key={member.id}>
                                      <span>{member.name}{member.bot ? ' BOT' : ''}</span>
                                      <small>{formatDateTime(member.joinedAt)}</small>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p>{discordSummary.memberListError || 'No recent joins returned.'}</p>
                              )}
                            </div>
                            <div>
                              <h4>Member Audit Log</h4>
                              {discordSummary.auditEvents.length > 0 ? (
                                <ul>
                                  {discordSummary.auditEvents.map((event) => (
                                    <li key={event.id}>
                                      <span>{event.action}: {event.target}</span>
                                      <small>{formatDateTime(event.createdAt)} by {event.actor}</small>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p>{discordSummary.auditLogError || 'No recent member events found.'}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="field">
                      <label>TikTok Username</label>
                      <input
                        type="text"
                        value={tiktokUsername}
                        onChange={(event) => handleTikTokUsernameChange(event.target.value)}
                        placeholder="clawzpokeshipz"
                      />
                    </div>

                    <div className="field">
                      <label>TikTok Live Link</label>
                      <input type="text" value={tiktokLink} onChange={(event) => setTiktokLink(event.target.value)} />
                    </div>

                    <div className="field">
                      <label>Notification Message</label>
                      <textarea
                        value={customMessage}
                        onChange={(event) => setCustomMessage(event.target.value)}
                        placeholder="is now LIVE! Catch the pack openings!"
                        rows={2}
                        className="terminal-input"
                      />
                    </div>

                    <div className="field checkbox-field">
                      <label>
                        <input
                          type="checkbox"
                          checked={mentionEveryone}
                          onChange={(event) => setMentionEveryone(event.target.checked)}
                        />
                        Mention @everyone
                      </label>
                    </div>

                    <div className="admin-subsection homepage-editor">
                      <h3>
                        <LayoutDashboard size={18} /> HOME PAGE TEXT
                      </h3>
                      <div className="field">
                        <label>Hero Title</label>
                        <input
                          type="text"
                          value={homepageContent.heroTitle}
                          onChange={(event) => updateHomepageField('heroTitle', event.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>Hero Description</label>
                        <textarea
                          value={homepageContent.heroSubtitle}
                          onChange={(event) => updateHomepageField('heroSubtitle', event.target.value)}
                          rows={2}
                          className="terminal-input"
                        />
                      </div>
                      <div className="homepage-button-grid">
                        <div className="field">
                          <label>TikTok Button Text</label>
                          <input
                            type="text"
                            value={homepageContent.tiktokButtonLabel}
                            onChange={(event) => updateHomepageField('tiktokButtonLabel', event.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label>Discord Button Text</label>
                          <input
                            type="text"
                            value={homepageContent.discordButtonLabel}
                            onChange={(event) => updateHomepageField('discordButtonLabel', event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="homepage-cards-editor">
                        {homepageContent.cards.map((card, index) => (
                          <div className="homepage-card-editor" key={`homepage-card-editor-${index}`}>
                            <h4>Box {index + 1}</h4>
                            <div className="field">
                              <label>Title</label>
                              <input
                                type="text"
                                value={card.title}
                                onChange={(event) => updateHomepageCard(index, 'title', event.target.value)}
                              />
                            </div>
                            <div className="field">
                              <label>Text</label>
                              <textarea
                                value={card.body}
                                onChange={(event) => updateHomepageCard(index, 'body', event.target.value)}
                                rows={2}
                                className="terminal-input"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="dashboard-actions">
                      <button className="btn btn-primary" onClick={saveConfig} disabled={isBusy} type="button">
                        SAVE CONFIGURATION
                      </button>
                      <button className="btn btn-secondary" onClick={testNotify} disabled={isBusy} type="button">
                        SEND TEST NOTIFY
                      </button>
                    </div>
                  </div>

                  <div className="admin-sidebar">
                    <div className="profile-edit-section">
                      <h3>
                        <Settings size={18} /> PROFILE
                      </h3>
                      <input
                        type="text"
                        placeholder="Change Name"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        className="sidebar-input"
                      />
                      <input
                        type="password"
                        placeholder="Change Password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        className="sidebar-input"
                      />
                      <button className="btn btn-small full-width" onClick={handleProfileUpdate} disabled={isBusy} type="button">
                        UPDATE PROFILE
                      </button>
                    </div>

                    <button className="btn btn-secondary full-width mt-20" onClick={handleLogout} type="button">
                      <LogOut size={18} /> LOGOUT
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {view === 'home' && (
          <section className="features">
            {homepageContent.cards.map((card, index) => (
              <div className="card" key={`${card.title}-${index}`}>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </div>
            ))}
          </section>
        )}
      </main>

      <footer>
        <p>&copy; {new Date().getFullYear()} ClawzPokeShipz. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
