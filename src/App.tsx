import { useState, useEffect } from 'react';
import { Youtube, Send, ExternalLink, Radio, Lock, LayoutDashboard, Settings, LogOut, Bell } from 'lucide-react';

// --- TYPES ---
type Channel = { id: string; name: string; type: number };

function App() {
  const [isLive, setIsLive] = useState(false);
  const [view, setView] = useState<'home' | 'login' | 'dashboard'>('home');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  
  // Admin Data
  const [guildId, setGuildId] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [tiktokLink, setTiktokLink] = useState('https://www.tiktok.com/@clawzpokeshipz/live');

  const [customMessage, setCustomMessage] = useState('is now LIVE on TikTok!');
  const [mentionEveryone, setMentionEveryone] = useState(false);

  const workerUrl = import.meta.env.VITE_WORKER_URL || 'https://your-worker.your-subdomain.workers.dev';

  // Polling for live status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${workerUrl}/status`);
        const data = await response.json();
        setIsLive(data.isLive);
      } catch (err) {
        console.error("Failed to fetch live status:", err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [workerUrl]);

  // Actual login logic
  const handleLogin = async () => {
    try {
      const response = await fetch(`${workerUrl}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await response.json();
      if (data.success) {
        setIsFirstLogin(data.isFirstLogin);
        setIsLoggedIn(true);
        setView('dashboard');
      } else {
        alert("Invalid Credentials");
      }
    } catch (err) {
      alert("Login failed. Check Worker connection.");
    }
  };

  const handlePasswordReset = async () => {
    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    try {
      await fetch(`${workerUrl}/admin/update-pass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, newPassword })
      });
      alert("Security Key updated successfully!");
      setPassword(newPassword);
      setIsFirstLogin(false);
    } catch (err) {
      alert("Failed to update password.");
    }
  };

  const fetchChannels = async () => {
    try {
      const response = await fetch(`${workerUrl}/admin/channels`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setChannels(data.filter((c: any) => c.type === 0));
      } else {
        alert("Could not fetch channels.");
      }
    } catch (err) {
      alert("Error fetching channels.");
    }
  };

  const saveConfig = async () => {
    try {
      await fetch(`${workerUrl}/admin/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          guildId, 
          channelId: selectedChannel,
          tiktokUsername: 'clawzpokeshipz',
          customMessage,
          mentionEveryone
        })
      });
      alert("Configuration Saved!");
    } catch (err) {
      alert("Failed to save configuration.");
    }
  };

  const testNotify = async () => {
    try {
      const response = await fetch(`${workerUrl}/admin/test-notify`, { method: 'POST' });
      if (response.ok) {
        alert("Test notification sent to Discord!");
      } else {
        const err = await response.json();
        alert(`Error: ${JSON.stringify(err)}`);
      }
    } catch (err) {
      alert("Failed to send test notification.");
    }
  };

  return (
    <div className="container">
      {/* --- BANNER --- */}
      <div className="banner-container">
        <img src="/logo.png" alt="ClawzPokeShipz Logo" className="banner-image" />
      </div>
      
      {/* --- HEADER --- */}
      <header>
        <div className="logo-area" onClick={() => setView('home')} style={{cursor: 'pointer'}}>
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
            <button className="btn-icon" onClick={() => setView('login')} title="Admin Login">
              <Lock size={20} />
            </button>
          ) : (
            <button className="btn-icon" onClick={() => setView('dashboard')} title="Dashboard">
              <LayoutDashboard size={20} />
            </button>
          )}
        </div>
      </header>

      {/* --- MAIN VIEWS --- */}
      <main>
        {view === 'home' && (
          <section className="hero">
            <h2>The PokeShipz Hub</h2>
            <p>Catch the latest pack openings and battles live on TikTok. Join our community of trainers!</p>
            <div className="cta-buttons">
              <a href={tiktokLink} target="_blank" className="btn btn-primary">
                <ExternalLink size={20} />
                Visit TikTok
              </a>
              <a href="https://discord.gg/9JVNTanBEP" target="_blank" className="btn btn-secondary">
                <Send size={20} />
                Join Discord
              </a>
            </div>
          </section>
        )}

        {view === 'login' && (
          <section className="admin-box">
            <div className="terminal-header">ADMIN ACCESS PORTAL</div>
            <div className="terminal-body">
              <p className="prompt">USER: CLAW</p>
              <div className="input-group">
                <span className="prompt">PASS: </span>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  autoFocus
                />
              </div>
              <button className="btn btn-primary mt-20" onClick={handleLogin}>AUTHORIZE</button>
            </div>
          </section>
        )}

        {view === 'dashboard' && isLoggedIn && (
          <section className="admin-box dashboard">
            <div className="terminal-header">PC STORAGE SYSTEM - ADMIN PANEL</div>
            <div className="terminal-body">
              
              {isFirstLogin ? (
                <div className="reset-flow">
                  <h3>SECURITY ALERT: TEMPORARY PASSWORD DETECTED</h3>
                  <p>Please set your permanent administrative password:</p>
                  <input 
                    type="password" 
                    placeholder="New Password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={handlePasswordReset}>UPDATE SECURITY KEY</button>
                </div>
              ) : (
                <div className="dashboard-grid">
                  <div className="admin-section">
                    <h3><Bell size={18} /> NOTIFICATION SETTINGS</h3>
                    <div className="field">
                      <label>Discord Bot Installation:</label>
                      <a href="https://discord.com/oauth2/authorize?client_id=1502495245026201690&permissions=8&scope=bot" target="_blank" className="btn btn-secondary btn-small">
                        Add Bot to Server
                      </a>
                    </div>
                    
                    <div className="field">
                      <label>Guild (Server) ID:</label>
                      <input 
                        type="text" 
                        value={guildId} 
                        onChange={(e) => setGuildId(e.target.value)}
                        placeholder="Enter Guild ID"
                      />
                      <button className="btn-small" onClick={fetchChannels}>Fetch Channels</button>
                    </div>

                    <div className="field">
                      <label>Target Channel:</label>
                      <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)}>
                        <option value="">Select a channel...</option>
                        {channels.map(ch => (
                          <option key={ch.id} value={ch.id}>#{ch.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>TikTok Live Link:</label>
                      <input 
                        type="text" 
                        value={tiktokLink} 
                        onChange={(e) => setTiktokLink(e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Notification Message:</label>
                      <textarea 
                        value={customMessage} 
                        onChange={(e) => setCustomMessage(e.target.value)}
                        placeholder="e.g. is now LIVE! Catch the pack openings!"
                        rows={2}
                        className="terminal-input"
                      />
                    </div>

                    <div className="field checkbox-field">
                      <label>
                        <input 
                          type="checkbox" 
                          checked={mentionEveryone} 
                          onChange={(e) => setMentionEveryone(e.target.checked)}
                        />
                        Mention @everyone
                      </label>
                    </div>
                    
                    <div className="dashboard-actions">
                      <button className="btn btn-primary" onClick={saveConfig}>SAVE CONFIGURATION</button>
                      <button className="btn btn-secondary" onClick={testNotify}>SEND TEST NOTIFY</button>
                    </div>
                  </div>

                  <div className="admin-sidebar">
                    <button className="btn btn-secondary full-width" onClick={() => setIsLoggedIn(false) || setView('home')}>
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
            <div className="card">
              <h3>Live Streams</h3>
              <p>Catch the latest pack openings and battles live on TikTok.</p>
            </div>
            <div className="card">
              <h3>Community</h3>
              <p>Join our Discord to chat with other trainers and collectors.</p>
            </div>
            <div className="card">
              <h3>Updates</h3>
              <p>Stay tuned for new PokeShipz content and special events.</p>
            </div>
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

