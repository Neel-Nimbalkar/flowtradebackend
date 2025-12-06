import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import './sidebar.css';

const items = [
  { key: 'builder', label: 'Strategy Builder', icon: 'puzzle' },
  { key: 'backtest', label: 'Backtesting', icon: 'bolt' },
  { key: 'analytics', label: 'Analytics', icon: 'ai' },
  { key: 'alerts', label: 'Alerts', icon: 'drop' },
  { key: 'account', label: 'Settings', icon: 'key' },
  { key: 'billing', label: 'Subscription', icon: 'target' },
  { key: 'help', label: 'Help', icon: 'search' }
];

const clearBuilderLoadRequest = () => {
  try {
    localStorage.removeItem('flowgrid_workflow_v1::load_request');
    // Dispatch event to tell builder to clear its canvas
    window.dispatchEvent(new Event('flowgrid:clear-builder'));
    console.log('[DashboardSidebar] Dispatched clear-builder event');
  } catch (e) {
    console.error('[DashboardSidebar] clearBuilderLoadRequest error', e);
  }
};

const SAVES_KEY = 'flowgrid_workflow_v1::saves';
const SidebarSavedKey = id => `flowgrid_saved_enabled::${id}`;

const DashboardSidebar = ({ onNavigate = () => {}, hideHome = false, activeKey = 'home' }) => {
  const [savedStrategies, setSavedStrategies] = useState([]);
  const [enabled, setEnabled] = useState({});
  const [savedOpen, setSavedOpen] = useState(true);

  const hasSavedWorkflow = (id) => {
    try {
      const raw = localStorage.getItem(SAVES_KEY) || '{}';
      const map = JSON.parse(raw);
      return !!map[id];
    } catch (e) {
      console.error('[DashboardSidebar] hasSavedWorkflow error', e);
      return false;
    }
  };

  const requestBuilderLoad = (id) => {
    const bridge = typeof window !== 'undefined' ? window.flowgridLiveBridge : null;
    if (bridge && typeof bridge.loadWorkflowById === 'function') {
      const ok = bridge.loadWorkflowById(id, { autoStart: true });
      if (ok) return true;
    }
    try { localStorage.setItem('flowgrid_workflow_v1::load_request', id); } catch (e) {}
    try { localStorage.setItem('flowgrid_pending_live_start', '1'); } catch (e) {}
    try {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('flowgrid:load-request'));
    } catch (e) {}
    return true;
  };

  const stopBuilderLiveIfActive = () => {
    const bridge = typeof window !== 'undefined' ? window.flowgridLiveBridge : null;
    if (bridge && typeof bridge.stopLive === 'function') {
      bridge.stopLive();
    }
  };

  const readSaved = () => {
    try {
      const raw = localStorage.getItem(SAVES_KEY);
      console.debug('[DashboardSidebar] readSaved raw:', raw);
      const map = raw ? JSON.parse(raw) : {};
      const list = Object.keys(map).map(name => ({ id: name, name }));
      console.debug('[DashboardSidebar] parsed saved list:', list);
      setSavedStrategies(list);
      const states = {};
      list.forEach(s => { states[s.id] = (localStorage.getItem(SidebarSavedKey(s.id)) === '1'); });
      setEnabled(states);
    } catch (e) { console.error('[DashboardSidebar] readSaved error', e); setSavedStrategies([]); }
  };

  useEffect(() => {
    readSaved();
    const onStorage = (e) => {
      if (!e || !e.key) return;
      if (e.key === SAVES_KEY) {
        readSaved();
      } else if (e.key.startsWith('flowgrid_saved_enabled::')) {
        const id = e.key.split('::')[1];
        setEnabled(prev => ({ ...prev, [id]: e.newValue === '1' }));
      }
    };
    window.addEventListener('storage', onStorage);
    const onCustom = () => readSaved();
    window.addEventListener('flowgrid:saves-updated', onCustom);
    window.addEventListener('focus', readSaved);
    
    // Listen for strategy-stopped event (same-tab communication)
    const onStrategyStopped = (e) => {
      console.log('[DashboardSidebar] Strategy stopped event received', e.detail);
      readSaved(); // Re-read all toggle states
    };
    window.addEventListener('flowgrid:strategy-stopped', onStrategyStopped);
    
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('flowgrid:saves-updated', onCustom);
      window.removeEventListener('focus', readSaved);
      window.removeEventListener('flowgrid:strategy-stopped', onStrategyStopped);
    };
  }, []);

  const toggle = (id) => {
    const currentlyEnabled = !!enabled[id];
    const next = !currentlyEnabled;
    console.log(`[DashboardSidebar] toggle "${id}" to ${next ? 'ON' : 'OFF'}`);

    if (next) {
      const exists = hasSavedWorkflow(id);
      if (!exists) {
        alert(`Saved strategy "${id}" could not be found. Please save it again in the builder.`);
        return;
      }
      requestBuilderLoad(id);
      try {
        localStorage.setItem('workflow_live', '1');
        localStorage.setItem('workflow_active_id', id);
        localStorage.setItem(SidebarSavedKey(id), '1');
        console.log(`[DashboardSidebar] workflow_live set to 1 for "${id}"`);
      } catch (e) { console.error('[DashboardSidebar] enable error', e); }
    } else {
      try { localStorage.setItem(SidebarSavedKey(id), '0'); } catch (e) { console.error(e); }
      const activeId = localStorage.getItem('workflow_active_id');
      console.log(`[DashboardSidebar] Disabling. Active ID was: "${activeId}"`);
      if (activeId === id) {
        stopBuilderLiveIfActive();
        try { localStorage.setItem('workflow_live', '0'); } catch (e) {}
        try { localStorage.removeItem('workflow_active_id'); } catch (e) {}
        try {
          const lr = localStorage.getItem('flowgrid_workflow_v1::load_request');
          if (lr === id) localStorage.removeItem('flowgrid_workflow_v1::load_request');
        } catch (e) {}
        console.log('[DashboardSidebar] Cleared workflow_live and workflow_active_id');
      }
    }

    setEnabled(prev => ({ ...prev, [id]: next }));
  };

  const handleStrategyClick = (id) => {
    try {
      console.log('[DashboardSidebar] handleStrategyClick:', id);
      // Clear existing load request first
      localStorage.removeItem('flowgrid_workflow_v1::load_request');
      // Set new load request
      localStorage.setItem('flowgrid_workflow_v1::load_request', id);
      // Dispatch custom event to force builder to process immediately
      window.dispatchEvent(new CustomEvent('flowgrid:load-request', { detail: { workflowId: id } }));
      // navigate to builder; builder will listen for load_request
      onNavigate('builder');
    } catch (e) { console.error('[DashboardSidebar] handleStrategyClick error', e); }
  };

  const handleDelete = (id) => {
    try {
      const ok = window.confirm(`Delete saved strategy "${id}"? This cannot be undone.`);
      if (!ok) return;
      const raw = localStorage.getItem(SAVES_KEY) || '{}';
      const map = JSON.parse(raw);
      if (map[id]) delete map[id];
      localStorage.setItem(SAVES_KEY, JSON.stringify(map));
      // clear enabled flag and active pointers if this was active
      try { localStorage.removeItem(SidebarSavedKey(id)); } catch (e) {}
      const active = localStorage.getItem('workflow_active_id');
      if (active === id) {
        localStorage.setItem('workflow_live', '0');
        localStorage.removeItem('workflow_active_id');
        stopBuilderLiveIfActive();
      }
      window.dispatchEvent(new Event('flowgrid:saves-updated'));
      readSaved();
    } catch (e) { console.error('[DashboardSidebar] delete error', e); }
  };

  

  return (
    <div className="df-sidebar">
      <div className="df-logo">
        <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8}}>
          <svg width="40" height="40" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="sidebarLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgb(41,98,255)" stopOpacity="1" />
                <stop offset="100%" stopColor="rgb(94,140,255)" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path d="M4 8 L16 8 L16 12 L4 12 Z" fill="url(#sidebarLogoGradient)" opacity="0.9" />
            <path d="M4 14 L28 14 L28 18 L4 18 Z" fill="url(#sidebarLogoGradient)" />
            <path d="M4 20 L22 20 L22 24 L4 24 Z" fill="url(#sidebarLogoGradient)" opacity="0.8" />
            <circle cx="26" cy="10" r="2" fill="#5e8cff" />
            <circle cx="24" cy="22" r="2" fill="#2962ff" />
          </svg>
          <h2 style={{fontSize: 18, fontWeight: 800, color: 'rgb(248,249,250)', margin: 0}}>FLOWTRADE</h2>
        </div>
      </div>
      <nav className="df-nav">
        {items.filter(it => !(hideHome && it.key === 'home')).map(it => (
          <button key={it.key} className={`df-nav-item ${it.key === activeKey ? 'active' : ''}`} onClick={() => onNavigate(it.key)}>
            <Icon name={it.icon} size={20} />
            <span>{it.label}</span>
          </button>
        ))}
      </nav>

      <div className="df-saved-section">
        <button className="df-saved-toggle" onClick={() => setSavedOpen(s => !s)} aria-expanded={savedOpen}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
            <Icon name="puzzle" size={16} />
            <div style={{fontSize:12, fontWeight:600, color:'var(--text-primary, #cfe8ff)'}}>Saved Strategies</div>
            <div style={{fontSize:12, color:'var(--text-muted, #9aa6c6)'}}>&nbsp;({savedStrategies.length})</div>
          </div>
          <div className={`df-caret ${savedOpen ? 'open' : ''}`}>▾</div>
        </button>

        {savedOpen && (
          <div className="df-saved-list">
            {savedStrategies.length === 0 && (
              <div className="df-no-saves">No saved strategies</div>
            )}
            {savedStrategies.map(p => (
              <div key={p.id} className="df-saved-row" onClick={() => handleStrategyClick(p.id)} title="Click to load in Builder">
                <div className="df-saved-row-left">
                  <Icon name="puzzle" size={16} />
                  <div className="df-saved-name" title={p.name}>{p.name}</div>
                </div>

                <div className="df-saved-row-right">
                  <label className="df-switch small" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={!!enabled[p.id]} onChange={() => toggle(p.id)} onClick={(e) => e.stopPropagation()} />
                    <span className="df-switch-slider" />
                  </label>
                  <button className="df-action-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} title="Delete">X</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="df-bottom">
        <button className="df-theme">Dark</button>
      </div>
    </div>
  );
};

export default DashboardSidebar;
