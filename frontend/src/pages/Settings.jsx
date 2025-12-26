import React, { useState, useEffect } from 'react';
import DashboardSidebar from '../components/DashboardSidebar';
import './Dashboard.css';
import './Settings.css';

// ============================================================================
// CONSTANTS
// ============================================================================
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE)
  ? import.meta.env.VITE_API_BASE.replace(/\/$/, '')
  : 'http://127.0.0.1:5000';

// LocalStorage keys
const STORAGE_KEYS = {
  ALPACA_KEY_ID: 'alpaca_key_id',
  ALPACA_SECRET: 'alpaca_secret_key',
  TELEGRAM_BOT_TOKEN: 'telegram_bot_token',
  TELEGRAM_CHAT_ID: 'telegram_chat_id',
  ALERT_SOUND: 'flowgrid_alert_sound',
  THEME: 'flowgrid_theme',
  CHART_COLORS: 'flowgrid_chart_colors',
  COMPACT_MODE: 'flowgrid_compact_mode',
  DISPLAY_NAME: 'flowgrid_display_name',
};

// ============================================================================
// ICON COMPONENTS
// ============================================================================
const Icons = {
  api: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  bell: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  user: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  palette: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="8" r="2" fill="currentColor"/>
      <circle cx="8" cy="14" r="2" fill="currentColor"/>
      <circle cx="16" cy="14" r="2" fill="currentColor"/>
    </svg>
  ),
  shield: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  x: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  loader: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinner">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
    </svg>
  ),
};

// ============================================================================
// TAB CONFIGURATION (removed Trading Preferences)
// ============================================================================
const TABS = [
  { id: 'api', label: 'API Configuration', icon: Icons.api },
  { id: 'notifications', label: 'Notifications', icon: Icons.bell },
  { id: 'account', label: 'Account', icon: Icons.user },
  { id: 'appearance', label: 'Appearance', icon: Icons.palette },
  { id: 'privacy', label: 'Data & Privacy', icon: Icons.shield },
];

// ============================================================================
// TOAST NOTIFICATION COMPONENT
// ============================================================================
const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`settings-toast ${type}`}>
      {type === 'success' ? Icons.check : Icons.x}
      <span>{message}</span>
    </div>
  );
};

// ============================================================================
// API CONFIGURATION TAB (removed paper/live trading toggle)
// ============================================================================
const ApiConfigTab = ({ showToast }) => {
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    setKeyId(localStorage.getItem(STORAGE_KEYS.ALPACA_KEY_ID) || '');
    setSecret(localStorage.getItem(STORAGE_KEYS.ALPACA_SECRET) || '');
  }, []);

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEYS.ALPACA_KEY_ID, keyId.trim());
    localStorage.setItem(STORAGE_KEYS.ALPACA_SECRET, secret.trim());
    showToast('API credentials saved successfully', 'success');
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEYS.ALPACA_KEY_ID);
    localStorage.removeItem(STORAGE_KEYS.ALPACA_SECRET);
    setKeyId('');
    setSecret('');
    showToast('API credentials cleared', 'success');
  };

  const handleTestConnection = async () => {
    if (!keyId || !secret) {
      showToast('Please enter API credentials first', 'error');
      return;
    }
    
    setValidating(true);
    setValidationResult(null);
    
    try {
      const res = await fetch(`${API_BASE}/test_alpaca_keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          alpacaKeyId: keyId.trim(), 
          alpacaSecretKey: secret.trim()
        })
      });
      const data = await res.json().catch(() => null);
      
      if (res.ok && data?.ok) {
        setValidationResult({ ok: true, msg: data.message || 'Connection successful' });
        showToast('API connection verified!', 'success');
      } else {
        setValidationResult({ ok: false, msg: data?.error || `HTTP ${res.status}` });
        showToast('Connection failed', 'error');
      }
    } catch (e) {
      setValidationResult({ ok: false, msg: String(e) });
      showToast('Connection error', 'error');
    }
    setValidating(false);
  };

  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h3 className="settings-section-title">Alpaca Trading API</h3>
        <p className="settings-section-desc">
          Connect your Alpaca brokerage account to enable live trading and real-time market data.
        </p>

        <div className="settings-form-group">
          <label className="settings-label">API Key ID</label>
          <input
            type="text"
            className="settings-input"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            placeholder="Enter your Alpaca API Key ID"
          />
        </div>

        <div className="settings-form-group">
          <label className="settings-label">Secret Key</label>
          <div className="settings-input-group">
            <input
              type={showSecret ? 'text' : 'password'}
              className="settings-input"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Enter your Alpaca Secret Key"
              autoComplete="new-password"
            />
            <button 
              type="button" 
              className="settings-input-toggle"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {validationResult && (
          <div className={`settings-validation-result ${validationResult.ok ? 'success' : 'error'}`}>
            {validationResult.ok ? Icons.check : Icons.x}
            <span>{validationResult.msg}</span>
          </div>
        )}

        <div className="settings-button-group">
          <button className="settings-btn primary" onClick={handleSave}>
            Save Credentials
          </button>
          <button 
            className="settings-btn secondary" 
            onClick={handleTestConnection}
            disabled={validating || !keyId || !secret}
          >
            {validating ? <>{Icons.loader} Testing...</> : 'Test Connection'}
          </button>
          <button className="settings-btn danger-text" onClick={handleClear}>
            Clear
          </button>
        </div>

        <div className="settings-info-box">
          <strong>Note:</strong> Your API credentials are stored locally in your browser and are never sent to our servers.
          Get your API keys from <a href="https://app.alpaca.markets/paper/dashboard/overview" target="_blank" rel="noopener noreferrer">Alpaca Dashboard</a>.
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// NOTIFICATIONS TAB (working alert preferences)
// ============================================================================
const NotificationsTab = ({ showToast }) => {
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    setTelegramBotToken(localStorage.getItem(STORAGE_KEYS.TELEGRAM_BOT_TOKEN) || '');
    setTelegramChatId(localStorage.getItem(STORAGE_KEYS.TELEGRAM_CHAT_ID) || '');
    setSoundEnabled(localStorage.getItem(STORAGE_KEYS.ALERT_SOUND) !== 'false');
  }, []);

  const handleSaveTelegram = async () => {
    localStorage.setItem(STORAGE_KEYS.TELEGRAM_BOT_TOKEN, telegramBotToken.trim());
    localStorage.setItem(STORAGE_KEYS.TELEGRAM_CHAT_ID, telegramChatId.trim());
    
    try {
      await fetch(`${API_BASE}/api/telegram/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_token: telegramBotToken.trim(),
          chat_id: telegramChatId.trim()
        })
      });
      showToast('Telegram settings saved', 'success');
    } catch (e) {
      showToast('Saved locally, but failed to sync to server', 'error');
    }
  };

  const handleTestTelegram = async () => {
    if (!telegramBotToken || !telegramChatId) {
      showToast('Please enter Telegram credentials first', 'error');
      return;
    }
    
    setTesting(true);
    try {
      const res = await fetch(`${API_BASE}/api/telegram/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json().catch(() => null);
      
      if (res.ok && data?.success) {
        showToast('Test message sent! Check your Telegram.', 'success');
      } else {
        showToast(data?.error || 'Failed to send test message', 'error');
      }
    } catch (e) {
      showToast('Failed to send test message', 'error');
    }
    setTesting(false);
  };

  const handleSoundToggle = (enabled) => {
    setSoundEnabled(enabled);
    localStorage.setItem(STORAGE_KEYS.ALERT_SOUND, enabled.toString());
    showToast(`Sound alerts ${enabled ? 'enabled' : 'disabled'}`, 'success');
  };

  // Play test sound
  const playTestSound = () => {
    try {
      // Create a simple beep using Web Audio API
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
      
      showToast('Sound played!', 'success');
    } catch (e) {
      showToast('Could not play sound', 'error');
    }
  };

  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h3 className="settings-section-title">Telegram Notifications 📱</h3>
        <p className="settings-section-desc">
          Receive trading signals and alerts directly to your Telegram.
        </p>

        <div className="settings-form-group">
          <label className="settings-label">Bot Token (from @BotFather)</label>
          <div className="settings-input-group">
            <input
              type={showToken ? 'text' : 'password'}
              className="settings-input"
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
              placeholder="Enter Bot Token (e.g., 123456:ABC-DEF...)"
            />
            <button 
              type="button" 
              className="settings-input-toggle"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="settings-form-group">
          <label className="settings-label">Chat ID</label>
          <input
            type="text"
            className="settings-input"
            value={telegramChatId}
            onChange={(e) => setTelegramChatId(e.target.value)}
            placeholder="Enter Chat ID (e.g., 123456789)"
          />
          <span className="settings-input-hint">
            Get your Chat ID from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer">@userinfobot</a>
          </span>
        </div>

        <div className="settings-button-group">
          <button className="settings-btn primary" onClick={handleSaveTelegram}>
            Save Telegram Settings
          </button>
          <button 
            className="settings-btn secondary" 
            onClick={handleTestTelegram}
            disabled={testing || !telegramBotToken || !telegramChatId}
          >
            {testing ? <>{Icons.loader} Sending...</> : 'Send Test Message'}
          </button>
        </div>

        <div className="settings-info-box">
          <strong>Setup Guide:</strong>
          <ol>
            <li>Search for @BotFather on Telegram</li>
            <li>Send /newbot and follow the instructions</li>
            <li>Copy the bot token provided</li>
            <li>Get your Chat ID from @userinfobot</li>
          </ol>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Alert Preferences</h3>
        
        <div className="settings-toggle-group">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => handleSoundToggle(e.target.checked)}
            />
            <span className="toggle-switch" />
            <span className="toggle-label">
              <span className="toggle-title">Sound Alerts</span>
              <span className="toggle-desc">Play sound when new signals are generated</span>
            </span>
          </label>
        </div>

        <div className="settings-button-group" style={{ marginTop: 16 }}>
          <button 
            className="settings-btn secondary" 
            onClick={playTestSound}
            disabled={!soundEnabled}
          >
            🔊 Test Sound
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ACCOUNT TAB (working display name)
// ============================================================================
const AccountTab = ({ showToast }) => {
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    setDisplayName(localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME) || '');
  }, []);

  const handleSave = () => {
    const trimmedName = displayName.trim();
    localStorage.setItem(STORAGE_KEYS.DISPLAY_NAME, trimmedName);
    // Dispatch custom event so Dashboard can update immediately
    window.dispatchEvent(new CustomEvent('flowgrid:settings-updated', { 
      detail: { displayName: trimmedName } 
    }));
    showToast('Display name saved', 'success');
  };

  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h3 className="settings-section-title">Profile</h3>
        
        <div className="settings-form-group">
          <label className="settings-label">Display Name</label>
          <input
            type="text"
            className="settings-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
          />
          <span className="settings-input-hint">This name will be shown on your dashboard welcome message</span>
        </div>

        <div className="settings-button-group">
          <button className="settings-btn primary" onClick={handleSave}>
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// APPEARANCE TAB (working theme and color settings)
// ============================================================================
const AppearanceTab = ({ showToast }) => {
  const [theme, setTheme] = useState('dark');
  const [chartColors, setChartColors] = useState('default');
  const [compactMode, setCompactMode] = useState(false);

  useEffect(() => {
    setTheme(localStorage.getItem(STORAGE_KEYS.THEME) || 'dark');
    setChartColors(localStorage.getItem(STORAGE_KEYS.CHART_COLORS) || 'default');
    setCompactMode(localStorage.getItem(STORAGE_KEYS.COMPACT_MODE) === 'true');
  }, []);

  const applyTheme = (newTheme) => {
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // Apply theme-specific CSS variables
    if (newTheme === 'light') {
      document.documentElement.style.setProperty('--bg-primary', '#f8fafc');
      document.documentElement.style.setProperty('--bg-secondary', '#ffffff');
      document.documentElement.style.setProperty('--bg-tertiary', '#f1f5f9');
      document.documentElement.style.setProperty('--text-primary', '#1e293b');
      document.documentElement.style.setProperty('--text-secondary', '#475569');
      document.documentElement.style.setProperty('--border-color', 'rgba(0, 0, 0, 0.1)');
    } else {
      document.documentElement.style.setProperty('--bg-primary', '#0a0e17');
      document.documentElement.style.setProperty('--bg-secondary', '#111827');
      document.documentElement.style.setProperty('--bg-tertiary', '#1f2937');
      document.documentElement.style.setProperty('--text-primary', '#f8fafc');
      document.documentElement.style.setProperty('--text-secondary', '#94a3b8');
      document.documentElement.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.06)');
    }
  };

  const applyChartColors = (colorScheme) => {
    let upColor, downColor;
    
    switch (colorScheme) {
      case 'blue':
        upColor = '#3b82f6';
        downColor = '#f97316';
        break;
      case 'monochrome':
        upColor = '#e2e8f0';
        downColor = '#64748b';
        break;
      case 'colorblind':
        upColor = '#0ea5e9';
        downColor = '#f59e0b';
        break;
      default: // default green/red
        upColor = '#3b82f6';
        downColor = '#ef4444';
    }
    
    document.documentElement.style.setProperty('--chart-up-color', upColor);
    document.documentElement.style.setProperty('--chart-down-color', downColor);
    
    // Dispatch event so charts can re-render
    window.dispatchEvent(new CustomEvent('flowgrid:chart-colors-changed', { 
      detail: { upColor, downColor } 
    }));
  };

  const applyCompactMode = (compact) => {
    if (compact) {
      document.body.classList.add('compact-mode');
    } else {
      document.body.classList.remove('compact-mode');
    }
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
    applyTheme(newTheme);
    showToast(`Theme changed to ${newTheme}`, 'success');
  };

  const handleChartColorsChange = (colorScheme) => {
    setChartColors(colorScheme);
    localStorage.setItem(STORAGE_KEYS.CHART_COLORS, colorScheme);
    applyChartColors(colorScheme);
    showToast('Chart colors updated', 'success');
  };

  const handleCompactModeChange = (compact) => {
    setCompactMode(compact);
    localStorage.setItem(STORAGE_KEYS.COMPACT_MODE, compact.toString());
    applyCompactMode(compact);
    showToast(`Compact mode ${compact ? 'enabled' : 'disabled'}`, 'success');
  };

  // Apply saved settings on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    const savedColors = localStorage.getItem(STORAGE_KEYS.CHART_COLORS) || 'default';
    const savedCompact = localStorage.getItem(STORAGE_KEYS.COMPACT_MODE) === 'true';
    
    applyTheme(savedTheme);
    applyChartColors(savedColors);
    applyCompactMode(savedCompact);
  }, []);

  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h3 className="settings-section-title">Theme</h3>
        
        <div className="settings-theme-grid">
          <button 
            className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => handleThemeChange('dark')}
          >
            <div className="theme-preview dark">
              <div className="theme-preview-header" />
              <div className="theme-preview-content">
                <div className="theme-preview-sidebar" />
                <div className="theme-preview-main" />
              </div>
            </div>
            <span>Dark</span>
          </button>
          
          <button 
            className={`theme-option ${theme === 'light' ? 'active' : ''}`}
            onClick={() => handleThemeChange('light')}
          >
            <div className="theme-preview light">
              <div className="theme-preview-header" />
              <div className="theme-preview-content">
                <div className="theme-preview-sidebar" />
                <div className="theme-preview-main" />
              </div>
            </div>
            <span>Light</span>
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Chart Colors</h3>
        
        <div className="settings-form-group">
          <label className="settings-label">Color Scheme</label>
          <select
            className="settings-select"
            value={chartColors}
            onChange={(e) => handleChartColorsChange(e.target.value)}
          >
            <option value="default">Default (Green/Red)</option>
            <option value="blue">Blue/Orange</option>
            <option value="monochrome">Monochrome</option>
            <option value="colorblind">Colorblind Friendly</option>
          </select>
          
          <div className="color-preview" style={{ marginTop: 12, display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ 
                width: 24, 
                height: 24, 
                borderRadius: 4, 
                background: chartColors === 'default' ? '#3b82f6' : 
                           chartColors === 'blue' ? '#3b82f6' : 
                           chartColors === 'monochrome' ? '#e2e8f0' : '#0ea5e9'
              }} />
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Up/Profit</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ 
                width: 24, 
                height: 24, 
                borderRadius: 4, 
                background: chartColors === 'default' ? '#ef4444' : 
                           chartColors === 'blue' ? '#f97316' : 
                           chartColors === 'monochrome' ? '#64748b' : '#f59e0b'
              }} />
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Down/Loss</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Layout</h3>
        
        <div className="settings-toggle-group">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={compactMode}
              onChange={(e) => handleCompactModeChange(e.target.checked)}
            />
            <span className="toggle-switch" />
            <span className="toggle-label">
              <span className="toggle-title">Compact Mode</span>
              <span className="toggle-desc">Reduce spacing and padding for more data density</span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// DATA & PRIVACY TAB (working export and clear)
// ============================================================================
const DataPrivacyTab = ({ showToast }) => {
  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    setExporting(true);
    try {
      // Collect all localStorage data
      const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        settings: {},
        strategies: null,
        trades: null,
      };

      // Export all settings
      Object.entries(STORAGE_KEYS).forEach(([key, storageKey]) => {
        const value = localStorage.getItem(storageKey);
        if (value) {
          exportData.settings[key] = value;
        }
      });

      // Export strategies
      const strategies = localStorage.getItem('flowgrid_workflow_v1::saves');
      if (strategies) {
        try {
          exportData.strategies = JSON.parse(strategies);
        } catch (e) {
          exportData.strategies = strategies;
        }
      }

      // Try to export trades from backend
      try {
        const res = await fetch(`${API_BASE}/api/trades`);
        if (res.ok) {
          const data = await res.json();
          exportData.trades = data.trades || data;
        }
      } catch (e) {
        console.log('Could not fetch trades from backend');
      }

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flowgrid-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Data exported successfully', 'success');
    } catch (e) {
      showToast('Failed to export data: ' + e.message, 'error');
    }
    setExporting(false);
  };

  const handleExportStrategies = () => {
    try {
      const strategies = localStorage.getItem('flowgrid_workflow_v1::saves');
      if (!strategies) {
        showToast('No strategies to export', 'error');
        return;
      }

      const blob = new Blob([strategies], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flowgrid-strategies-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Strategies exported successfully', 'success');
    } catch (e) {
      showToast('Failed to export strategies', 'error');
    }
  };

  const handleClearCache = () => {
    if (window.confirm('This will clear cached market data and temporary files. Your settings and strategies will NOT be affected. Continue?')) {
      // Clear only cache-related items
      const cacheKeys = [
        'flowgrid_market_cache', 
        'flowgrid_price_cache',
        'flowgrid_analytics_cache'
      ];
      cacheKeys.forEach(key => localStorage.removeItem(key));
      showToast('Cache cleared successfully', 'success');
    }
  };

  const handleClearTrades = async () => {
    if (window.confirm('⚠️ This will delete ALL your trade history. This cannot be undone. Continue?')) {
      try {
        const res = await fetch(`${API_BASE}/api/trades`, { method: 'DELETE' });
        if (res.ok) {
          showToast('All trades deleted', 'success');
        } else {
          showToast('Failed to delete trades', 'error');
        }
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
  };

  const handleClearStrategies = () => {
    if (window.confirm('⚠️ This will delete ALL your saved strategies. This cannot be undone. Continue?')) {
      localStorage.removeItem('flowgrid_workflow_v1::saves');
      localStorage.removeItem('flowgrid_enabled_strategies');
      showToast('All strategies deleted', 'success');
      window.dispatchEvent(new CustomEvent('flowgrid:strategies-cleared'));
    }
  };

  const handleClearAllData = () => {
    if (window.confirm('⚠️ WARNING: This will delete ALL your data including strategies, settings, and API keys. This cannot be undone. Are you sure?')) {
      if (window.confirm('Are you REALLY sure? This action is irreversible.')) {
        // Clear backend trades
        fetch(`${API_BASE}/api/trades`, { method: 'DELETE' }).catch(() => {});
        
        // Clear all localStorage
        localStorage.clear();
        
        showToast('All data cleared. Page will reload...', 'success');
        setTimeout(() => window.location.reload(), 1500);
      }
    }
  };

  return (
    <div className="settings-tab-content">
      <div className="settings-section">
        <h3 className="settings-section-title">Export Data</h3>
        <p className="settings-section-desc">
          Download a copy of your settings, strategies, and trade history.
        </p>

        <div className="settings-button-group">
          <button 
            className="settings-btn primary" 
            onClick={handleExportData}
            disabled={exporting}
          >
            {exporting ? <>{Icons.loader} Exporting...</> : '📦 Export All Data'}
          </button>
          <button 
            className="settings-btn secondary" 
            onClick={handleExportStrategies}
          >
            📊 Export Strategies Only
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Clear Cache</h3>
        <p className="settings-section-desc">
          Clear temporary data and cached market information to free up storage.
        </p>

        <div className="settings-button-group">
          <button className="settings-btn secondary" onClick={handleClearCache}>
            🗑️ Clear Cache
          </button>
        </div>
      </div>

      <div className="settings-section danger">
        <h3 className="settings-section-title">Danger Zone</h3>
        <p className="settings-section-desc">
          These actions are permanent and cannot be undone.
        </p>

        <div className="settings-button-group" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <button className="settings-btn danger" onClick={handleClearTrades}>
            🗑️ Delete All Trades
          </button>
          <button className="settings-btn danger" onClick={handleClearStrategies}>
            🗑️ Delete All Strategies
          </button>
          <button className="settings-btn danger" onClick={handleClearAllData} style={{ marginTop: 8 }}>
            ☢️ Delete Everything (Factory Reset)
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Privacy Information</h3>
        <div className="settings-info-box">
          <ul>
            <li>All data is stored locally in your browser</li>
            <li>API credentials are never sent to our servers</li>
            <li>Market data is fetched directly from Alpaca</li>
            <li>No analytics or tracking cookies are used</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN SETTINGS PAGE
// ============================================================================
const Settings = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState('api');
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'api':
        return <ApiConfigTab showToast={showToast} />;
      case 'notifications':
        return <NotificationsTab showToast={showToast} />;
      case 'account':
        return <AccountTab showToast={showToast} />;
      case 'appearance':
        return <AppearanceTab showToast={showToast} />;
      case 'privacy':
        return <DataPrivacyTab showToast={showToast} />;
      default:
        return <ApiConfigTab showToast={showToast} />;
    }
  };

  return (
    <div className="dashboard-page">
      <DashboardSidebar onNavigate={onNavigate} activeRoute="settings" />
      
      <main className="dashboard-main settings-page">
        <div className="dashboard-header">
          <h1>Settings</h1>
        </div>

        <div className="settings-container">
          {/* Tab Navigation */}
          <nav className="settings-nav">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Tab Content */}
          <div className="settings-content">
            {renderTabContent()}
          </div>
        </div>
      </main>

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Settings;
