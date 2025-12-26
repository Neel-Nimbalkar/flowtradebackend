/**
 * Trade Detail Modal - FlowGrid Trading
 * Displays full trade details in a modal overlay
 */

import React from 'react';

// =============================================================================
// Utility Functions
// =============================================================================

const formatCurrency = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '--';
  return `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (value, showSign = true) => {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatDateTime = (ts) => {
  if (!ts) return '--';
  try {
    return new Date(ts).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return '--';
  }
};

const formatDuration = (openTs, closeTs) => {
  if (!openTs || !closeTs) return '--';
  try {
    const ms = new Date(closeTs) - new Date(openTs);
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  } catch {
    return '--';
  }
};

// =============================================================================
// Section Component
// =============================================================================

const Section = ({ title, children }) => (
  <div className="modal-section">
    <div className="section-title">{title}</div>
    <div className="section-content">{children}</div>
  </div>
);

// =============================================================================
// Field Component
// =============================================================================

const Field = ({ label, value, badge, color, bold, mono }) => {
  const valueClass = [
    'field-value',
    color === 'positive' ? 'positive' : '',
    color === 'negative' ? 'negative' : '',
    bold ? 'bold' : '',
    mono ? 'mono' : ''
  ].filter(Boolean).join(' ');
  
  return (
    <div className="modal-field">
      <span className="field-label">{label}</span>
      {badge ? (
        <span className={`side-badge ${String(value).toLowerCase()}`}>{value}</span>
      ) : (
        <span className={valueClass}>{value}</span>
      )}
    </div>
  );
};

// =============================================================================
// Main Modal Component
// =============================================================================

const TradeDetailModal = ({ trade, strategyName, onClose }) => {
  if (!trade) return null;
  
  const netPctColor = (trade.net_pct || 0) > 0 ? 'positive' : (trade.net_pct || 0) < 0 ? 'negative' : '';
  const grossPctColor = (trade.gross_pct || 0) > 0 ? 'positive' : (trade.gross_pct || 0) < 0 ? 'negative' : '';
  
  // Handle click outside to close
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };
  
  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);
  
  return (
    <div className="trade-modal-overlay" onClick={handleBackdropClick}>
      <div className="trade-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <span className={`side-badge ${(trade.open_side || '').toLowerCase()}`}>
              {trade.open_side || 'UNKNOWN'}
            </span>
            <span className="trade-id">Trade {trade.id ? trade.id.slice(0, 8) : '--'}</span>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        {/* Body */}
        <div className="modal-body">
          {/* Overview Section */}
          <Section title="Overview">
            <Field label="Strategy" value={strategyName || trade.strategy_id || 'Unknown'} />
            <Field label="Side" value={trade.open_side || '--'} badge />
            <Field label="Duration" value={formatDuration(trade.open_ts, trade.close_ts)} />
          </Section>
          
          {/* Entry Section */}
          <Section title="Entry">
            <Field label="Time" value={formatDateTime(trade.open_ts)} mono />
            <Field label="Price" value={formatCurrency(trade.open_price)} />
          </Section>
          
          {/* Exit Section */}
          <Section title="Exit">
            <Field label="Time" value={formatDateTime(trade.close_ts)} mono />
            <Field label="Price" value={formatCurrency(trade.close_price)} />
          </Section>
          
          {/* Performance Section */}
          <Section title="Performance">
            <Field label="Gross %" value={formatPercent(trade.gross_pct)} color={grossPctColor} />
            <Field label="Fees %" value={formatPercent(trade.fee_pct_total, false)} />
            <Field label="Net %" value={formatPercent(trade.net_pct)} color={netPctColor} bold />
          </Section>
          
          {/* Metadata Section (if exists) */}
          {trade.meta && Object.keys(trade.meta).length > 0 && (
            <Section title="Metadata">
              {Object.entries(trade.meta).map(([key, value]) => (
                <Field 
                  key={key} 
                  label={key} 
                  value={typeof value === 'object' ? JSON.stringify(value) : String(value)} 
                  mono
                />
              ))}
            </Section>
          )}
        </div>
        
        {/* Footer */}
        <div className="modal-footer">
          <button className="modal-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TradeDetailModal;
