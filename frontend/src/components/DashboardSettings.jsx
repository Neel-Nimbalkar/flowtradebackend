import React, { useState, useEffect } from 'react';

const STORAGE_KEY_ID = 'alpaca_key_id';
const STORAGE_SECRET = 'alpaca_secret_key';

const DashboardSettings = ({ noWrapper = false }) => {
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const k = localStorage.getItem(STORAGE_KEY_ID) || '';
      const s = localStorage.getItem(STORAGE_SECRET) || '';
      setKeyId(k);
      setSecret(s);
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

  const status = () => {
    if (!keyId || !secret) return 'No API keys set';
    return 'Alpaca keys present';
  };

  const content = (
    <div className="panel-body">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          Note: Price Input nodes will automatically use these keys to fetch data from Alpaca. Remove Alpaca block from workflows.
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
