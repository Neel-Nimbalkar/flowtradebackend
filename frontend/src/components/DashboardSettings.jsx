import React, { useState, useEffect } from 'react';

const STORAGE_KEY_ID = 'alpaca_key_id';
const STORAGE_SECRET = 'alpaca_secret_key';
const TELEGRAM_BOT_TOKEN = 'telegram_bot_token';
const TELEGRAM_CHAT_ID = 'telegram_chat_id';

const DashboardSettings = ({ noWrapper = false }) => {
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [saved, setSaved] = useState(false);
  
  // Telegram state
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramSaved, setTelegramSaved] = useState(false);

  useEffect(() => {
    try {
      const k = localStorage.getItem(STORAGE_KEY_ID) || '';
      const s = localStorage.getItem(STORAGE_SECRET) || '';
      setKeyId(k);
      setSecret(s);
      
      // Load Telegram settings
      const botToken = localStorage.getItem(TELEGRAM_BOT_TOKEN) || '';
      const chatId = localStorage.getItem(TELEGRAM_CHAT_ID) || '';
      setTelegramBotToken(botToken);
      setTelegramChatId(chatId);
    } catch (e) {}
  }, []);

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY_ID, keyId.trim());
      localStorage.setItem(STORAGE_SECRET, secret.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) { console.warn(e); }
  };

  const clear = () => {
    try { localStorage.removeItem(STORAGE_KEY_ID); localStorage.removeItem(STORAGE_SECRET); setKeyId(''); setSecret(''); setSaved(true); setTimeout(() => setSaved(false), 1200); } catch (e) {}
  };

  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const validateKeys = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const res = await fetch('/test_alpaca_keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alpacaKeyId: keyId.trim(), alpacaSecretKey: secret.trim() })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.ok) {
        setValidationResult({ ok: true, msg: `Validated: ${data.message || 'OK'}` });
      } else {
        setValidationResult({ ok: false, msg: (data && data.error) || `HTTP ${res.status}` });
      }
    } catch (e) {
      setValidationResult({ ok: false, msg: String(e) });
    }
    setValidating(false);
  };
  
  // Telegram functions
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState(null);
  
  const saveTelegram = async () => {
    try {
      // Save to localStorage
      localStorage.setItem(TELEGRAM_BOT_TOKEN, telegramBotToken.trim());
      localStorage.setItem(TELEGRAM_CHAT_ID, telegramChatId.trim());
      
      // Also save to backend
      const res = await fetch('/api/telegram/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_token: telegramBotToken.trim(),
          chat_id: telegramChatId.trim()
        })
      });
      
      if (res.ok) {
        setTelegramSaved(true);
        setTimeout(() => setTelegramSaved(false), 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to save Telegram settings: ${data.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.warn(e);
      alert(`Error saving Telegram settings: ${e.message}`);
    }
  };
  
  const clearTelegram = () => {
    try {
      localStorage.removeItem(TELEGRAM_BOT_TOKEN);
      localStorage.removeItem(TELEGRAM_CHAT_ID);
      setTelegramBotToken('');
      setTelegramChatId('');
      setTelegramSaved(true);
      setTimeout(() => setTelegramSaved(false), 1200);
    } catch (e) {}
  };
  
  const testTelegram = async () => {
    setTelegramTesting(true);
    setTelegramTestResult(null);
    
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await res.json().catch(() => null);
      
      if (res.ok && data && data.success) {
        setTelegramTestResult({ ok: true, msg: `✅ ${data.message}` });
      } else {
        setTelegramTestResult({ ok: false, msg: (data && data.error) || `HTTP ${res.status}` });
      }
    } catch (e) {
      setTelegramTestResult({ ok: false, msg: String(e) });
    }
    
    setTelegramTesting(false);
  };

  const status = () => {
    if (!keyId || !secret) return 'No API keys set';
    return 'Alpaca keys present';
  };
  
  const telegramStatus = () => {
    if (!telegramBotToken || !telegramChatId) return 'No Telegram configured';
    return 'Telegram configured';
  };

  const content = (
    <div className="panel-body">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Alpaca API Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#cfe8ff' }}>Alpaca API Keys</h3>
          <label style={{ fontSize: 12, color: '#9fb2c9' }}>Alpaca Key ID</label>
          <input value={keyId} onChange={e => setKeyId(e.target.value)} placeholder="Enter Alpaca Key ID" style={{ padding: 8, borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)', background: 'transparent', color: '#e6eef8' }} />
          <label style={{ fontSize: 12, color: '#9fb2c9' }}>Alpaca Secret Key</label>
          <input type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Enter Alpaca Secret Key" autoComplete="new-password" style={{ padding: 8, borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)', background: 'transparent', color: '#e6eef8' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={save} className="toolbar-btn">Save</button>
            <button onClick={clear} className="toolbar-btn">Clear</button>
            <button onClick={validateKeys} disabled={validating || !keyId || !secret} className="toolbar-btn">{validating ? 'Validating...' : 'Validate'}</button>
            <div style={{ marginLeft: 'auto', color: '#93a3b6', alignSelf: 'center' }}>{saved ? 'Saved' : status()}</div>
          </div>
          {validationResult && (
            <div style={{ marginTop: 8, color: validationResult.ok ? '#7ee787' : '#ff9b9b' }}>{validationResult.msg}</div>
          )}
          <div style={{ marginTop: 8, color: '#93a3b6', fontSize: 12 }}>
            Note: Price Input nodes will automatically use these keys to fetch data from Alpaca.
          </div>
        </div>

        {/* Telegram Notification Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#cfe8ff' }}>Telegram Notifications 📱</h3>
          <div style={{ fontSize: 12, color: '#9fb2c9', lineHeight: 1.5 }}>
            Get trading signals sent directly to your Telegram.
            <br />
            <a href="https://core.telegram.org/bots#6-botfather" target="_blank" rel="noopener noreferrer" style={{ color: '#5e8cff' }}>Create a bot with @BotFather</a> and get your chat ID from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" style={{ color: '#5e8cff' }}>@userinfobot</a>
          </div>
          
          <label style={{ fontSize: 12, color: '#9fb2c9', marginTop: 8 }}>Bot Token (from @BotFather)</label>
          <input 
            type="password" 
            value={telegramBotToken} 
            onChange={e => setTelegramBotToken(e.target.value)} 
            placeholder="Enter Bot Token (e.g., 123456:ABC-DEF...)" 
            style={{ padding: 8, borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)', background: 'transparent', color: '#e6eef8' }} 
          />
          
          <label style={{ fontSize: 12, color: '#9fb2c9' }}>Chat ID (your Telegram user ID)</label>
          <input 
            value={telegramChatId} 
            onChange={e => setTelegramChatId(e.target.value)} 
            placeholder="Enter Chat ID (e.g., 123456789)" 
            style={{ padding: 8, borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)', background: 'transparent', color: '#e6eef8' }} 
          />
          
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={saveTelegram} className="toolbar-btn">Save</button>
            <button onClick={clearTelegram} className="toolbar-btn">Clear</button>
            <button onClick={testTelegram} disabled={telegramTesting || !telegramBotToken || !telegramChatId} className="toolbar-btn">
              {telegramTesting ? 'Testing...' : 'Send Test'}
            </button>
            <div style={{ marginLeft: 'auto', color: '#93a3b6', alignSelf: 'center' }}>
              {telegramSaved ? '✅ Saved' : telegramStatus()}
            </div>
          </div>
          
          {telegramTestResult && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: telegramTestResult.ok ? 'rgba(126, 231, 135, 0.1)' : 'rgba(255, 155, 155, 0.1)', color: telegramTestResult.ok ? '#7ee787' : '#ff9b9b' }}>
              {telegramTestResult.msg}
            </div>
          )}
          
          <div style={{ marginTop: 8, color: '#93a3b6', fontSize: 12 }}>
            💡 Notifications are sent automatically when strategies generate BUY/SELL signals.
          </div>
        </div>
      </div>
    </div>
  );

  if (noWrapper) return content;
  return (
    <div className="panel">
      <div className="panel-header">Alpaca API Settings</div>
      {content}
    </div>
  );
};

export default DashboardSettings;
