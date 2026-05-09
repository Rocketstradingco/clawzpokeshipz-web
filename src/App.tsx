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

  // Simulate login for now - will connect to Worker later
  const handleLogin = () => {
    if (password === 'Claw69') {
      setIsFirstLogin(true);
      setIsLoggedIn(true);
      setView('dashboard');
    } else {
      // In a real app, check against stored hash in KV
      alert("Invalid Credentials");
    }
  };

  const handlePasswordReset = () => {
    alert("Password updated! (Simulated)");
    setIsFirstLogin(false);
  };

  const fetchChannels = () => {
    // This will call the Worker which calls Discord API
    console.log("Fetching channels for guild:", guildId);
    setChannels([
      { id: '1', name: 'announcements', type: 0 },
      { id: '2', name: 'live-notifications', type: 0 },
      { id: '3', name: 'general', type: 0 },
    ]);
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
              <a href="https://discord.gg/yourlink" target="_blank" className="btn btn-secondary">
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
                    
                    <button className="btn btn-primary full-width">SAVE CONFIGURATION</button>
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
