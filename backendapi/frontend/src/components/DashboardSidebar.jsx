import React, { useState, useEffect } from 'react';
import './sidebar.css';

// FlowGrid Logo Component - Modern gradient logo
const FlowGridLogo = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="flowGridLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3B82F6" />
        <stop offset="100%" stopColor="#8B5CF6" />
      </linearGradient>
    </defs>
    <rect x="4" y="6" width="10" height="4" rx="1" fill="url(#flowGridLogoGrad)" opacity="0.85"/>
    <rect x="4" y="13" width="24" height="5" rx="1.5" fill="url(#flowGridLogoGrad)"/>
    <rect x="4" y="21" width="18" height="4" rx="1" fill="url(#flowGridLogoGrad)" opacity="0.7"/>
    <circle cx="24" cy="8" r="2.5" fill="#8B5CF6"/>
    <circle cx="22" cy="23" r="2" fill="#3B82F6"/>
  </svg>
);

// Sidebar Icon Component with bigger, cleaner SVG icons
const SidebarIcon = ({ name, size = 24 }) => {
  const icons = {
    home: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9,22 9,12 15,12 15,22"/>
      </svg>
    ),
    dashboard: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
    builder: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18"/>
        <path d="M9 21V9"/>
      </svg>
    ),
    backtest: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18"/>
        <path d="M18 9l-5 5-4-4-3 3"/>
        <circle cx="18" cy="9" r="2"/>
      </svg>
    ),
    analytics: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10"/>
        <path d="M12 20V4"/>
        <path d="M6 20v-6"/>
      </svg>
    ),
    trades: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    calendar: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
    journal: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        <line x1="8" y1="7" x2="16" y2="7"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    ),
    reports: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <line x1="10" y1="9" x2="8" y2="9"/>
      </svg>
    ),
    playbook: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5,3 19,12 5,21 5,3"/>
      </svg>
    ),
    notebook: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    ),
    account: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
    help: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    add: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    ),
    user: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  };
  return icons[name] || <span style={{ width: size, height: size }} />;
};

// Navigation items configuration
const mainNavItems = [
  { key: 'home', icon: 'dashboard', label: 'Dashboard', tooltip: 'Dashboard' },
  { key: 'builder', icon: 'builder', label: 'Strategy Builder', tooltip: 'Strategy Builder' },
  { key: 'backtest', icon: 'backtest', label: 'Backtesting', tooltip: 'Backtesting' },
  { key: 'analytics', icon: 'analytics', label: 'Analytics', tooltip: 'Analytics' },
];

const bottomNavItems = [
  { key: 'settings', icon: 'account', label: 'Settings', tooltip: 'Settings' },
];

const DashboardSidebar = ({ onNavigate = () => {}, hideHome = false, activeRoute = 'home' }) => {
  const [showTooltip, setShowTooltip] = useState(null);

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo" onClick={() => onNavigate('home')}>
        <FlowGridLogo size={36} />
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        {mainNavItems.filter(it => !(hideHome && it.key === 'home')).map(item => (
          <button
            key={item.key}
            className={`sidebar-nav-item ${item.key === activeRoute ? 'active' : ''}`}
            onClick={() => onNavigate(item.key)}
            title={item.tooltip}
            onMouseEnter={() => setShowTooltip(item.key)}
            onMouseLeave={() => setShowTooltip(null)}
          >
            <SidebarIcon name={item.icon} size={22} />
            {showTooltip === item.key && (
              <span className="sidebar-tooltip">{item.tooltip}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Spacer */}
      <div className="sidebar-spacer" />

      {/* Bottom Navigation */}
      <div className="sidebar-bottom">
        {bottomNavItems.map(item => (
          <button
            key={item.key}
            className={`sidebar-nav-item ${item.key === activeRoute ? 'active' : ''}`}
            onClick={() => onNavigate(item.key === 'settings' ? 'settings' : item.key)}
            title={item.tooltip}
            onMouseEnter={() => setShowTooltip(item.key)}
            onMouseLeave={() => setShowTooltip(null)}
          >
            <SidebarIcon name={item.icon} size={22} />
            {showTooltip === item.key && (
              <span className="sidebar-tooltip">{item.tooltip}</span>
            )}
          </button>
        ))}
      </div>
    </aside>
  );
};

export default DashboardSidebar;
