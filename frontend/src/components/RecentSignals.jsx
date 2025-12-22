import React, { useState, useEffect } from 'react';

const ALERTS_KEY = 'flowgrid_alerts_v1';
const ENABLED_STRATEGIES_KEY = 'flowgrid_enabled_strategies';

const RecentSignals = () => {
  const [signals, setSignals] = useState([]);
  const [enabledStrategies, setEnabledStrategies] = useState({});
  
  // Load enabled strategies
  const loadEnabledStrategies = () => {
    try {
      const raw = localStorage.getItem(ENABLED_STRATEGIES_KEY);
      if (raw) {
        setEnabledStrategies(JSON.parse(raw));
      }
    } catch (e) {
      console.error('Error loading enabled strategies:', e);
    }
  };
  
  // Load and filter signals
  const loadSignals = () => {
    try {
      const raw = localStorage.getItem(ALERTS_KEY);
      if (raw) {
        const allSignals = JSON.parse(raw);
        
        // Get enabled strategy names
        const enabledRaw = localStorage.getItem(ENABLED_STRATEGIES_KEY);
        const enabled = enabledRaw ? JSON.parse(enabledRaw) : {};
        
        // Filter to only show signals from enabled strategies
        const filteredSignals = allSignals.filter(signal => {
          const strategyId = signal.strategyId || signal.strategyName;
          return enabled[strategyId] === true;
        });
        
        setSignals(filteredSignals.slice(0, 10)); // Show last 10 signals
      } else {
        setSignals([]);
      }
    } catch (e) {
      console.error('Error loading signals:', e);
      setSignals([]);
    }
  };
  
  useEffect(() => {
    loadEnabledStrategies();
    loadSignals();
    
    // Listen for alerts updates
    const handleAlertsUpdated = () => {
      loadSignals();
    };
    
    // Listen for strategy toggle changes
    const handleStrategiesUpdated = (e) => {
      if (e.detail) {
        setEnabledStrategies(e.detail);
      }
      loadSignals();
    };
    
    window.addEventListener('flowgrid:alerts-updated', handleAlertsUpdated);
    window.addEventListener('flowgrid:strategies-updated', handleStrategiesUpdated);
    
    // Poll for changes
    const interval = setInterval(() => {
      loadEnabledStrategies();
      loadSignals();
    }, 2000);
    
    return () => {
      window.removeEventListener('flowgrid:alerts-updated', handleAlertsUpdated);
      window.removeEventListener('flowgrid:strategies-updated', handleStrategiesUpdated);
      clearInterval(interval);
    };
  }, []);
  
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric'
    });
  };
  
  const formatPrice = (price) => {
    if (price == null) return '--';
    return '$' + Number(price).toLocaleString(undefined, { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    });
  };
  
  // Count enabled strategies
  const enabledCount = Object.values(enabledStrategies).filter(Boolean).length;
  
  return (
    <div className="recent-trades-list">
      {enabledCount === 0 ? (
        <div className="no-trades">
          <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
          <p>Enable strategies to see signals</p>
          <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
            Toggle strategies ON in the panel above
          </p>
        </div>
      ) : signals.length === 0 ? (
        <div className="no-trades">
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <p>No recent signals</p>
          <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
            Run your strategies to generate signals
          </p>
        </div>
      ) : (
        signals.map((signal, index) => (
          <div key={signal.id || index} className="trade-item">
            <span className={`trade-signal ${signal.signal?.toLowerCase() || 'hold'}`}>
              {signal.signal || 'HOLD'}
            </span>
            <div className="trade-info">
              <div className="trade-strategy">
                {signal.strategyName || 'Unknown Strategy'}
              </div>
              {signal.symbol && (
                <span className="trade-symbol">{signal.symbol}</span>
              )}
              <div className="trade-time">
                {formatTime(signal.timestamp)}
              </div>
            </div>
            <div className="trade-price">
              {formatPrice(signal.price)}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default RecentSignals;
