import React, { useState, useEffect } from 'react';

const NodeSettings = ({ node, open, onClose, onSave }) => {
  const [values, setValues] = useState({});

  useEffect(() => {
    if (node) setValues(node.configValues || {});
  }, [node]);

  if (!open || !node) return null;

  const handleChange = (k, v) => setValues(prev => ({ ...prev, [k]: v }));
  const handleSave = () => {
    if (onSave) onSave({ ...node, configValues: values });
    if (onClose) onClose();
  };

  // Group config items by their 'group' property
  const groupedConfig = {};
  const ungroupedConfig = [];
  
  if (node.def?.config) {
    node.def.config.forEach(cfg => {
      if (cfg.group) {
        if (!groupedConfig[cfg.group]) {
          groupedConfig[cfg.group] = [];
        }
        groupedConfig[cfg.group].push(cfg);
      } else {
        ungroupedConfig.push(cfg);
      }
    });
  }

  const renderConfigItem = (cfg) => (
    <div key={cfg.key} style={{ marginBottom: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#cbd5e1', fontSize: 11, marginBottom: 4 }}>
        {cfg.label || cfg.key}
        {cfg.tooltip && (
          <span 
            title={cfg.tooltip}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              width: 14, 
              height: 14, 
              borderRadius: '50%', 
              background: '#2a2e39', 
              color: '#787b86', 
              fontSize: 9, 
              cursor: 'help',
              fontWeight: 600
            }}
          >?</span>
        )}
      </label>
      {cfg.type === 'select' ? (
        <select 
          value={values[cfg.key] ?? cfg.value} 
          onChange={e => handleChange(cfg.key, e.target.value)} 
          style={{ 
            width: '100%', 
            padding: '6px 8px', 
            borderRadius: 4, 
            border: '1px solid #2a2e39', 
            background: '#131722', 
            color: '#e5e7eb', 
            fontSize: 11,
            cursor: 'pointer'
          }}
        >
          {cfg.options.map(opt => {
            // Format option labels nicely
            const label = typeof opt === 'string' 
              ? opt.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
              : opt;
            return <option key={opt} value={opt}>{label}</option>;
          })}
        </select>
      ) : cfg.type === 'textarea' ? (
        <textarea 
          value={values[cfg.key] ?? cfg.value} 
          onChange={e => handleChange(cfg.key, e.target.value)} 
          style={{ 
            width: '100%', 
            minHeight: 60, 
            padding: '6px 8px', 
            borderRadius: 4, 
            border: '1px solid #2a2e39', 
            background: '#131722', 
            color: '#e5e7eb', 
            fontSize: 11,
            resize: 'vertical'
          }} 
        />
      ) : (
        <input 
          type={cfg.type} 
          value={values[cfg.key] ?? cfg.value} 
          onChange={e => handleChange(cfg.key, cfg.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)} 
          step={cfg.type === 'number' ? (cfg.key.includes('Threshold') || cfg.key.includes('threshold') ? 0.01 : 1) : undefined}
          style={{ 
            width: '100%', 
            padding: '6px 8px', 
            borderRadius: 4, 
            border: '1px solid #2a2e39', 
            background: '#131722', 
            color: '#e5e7eb', 
            fontSize: 11 
          }} 
        />
      )}
    </div>
  );

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, width: 340, height: '100%', background: '#1e222d', borderLeft: '1px solid #2a2e39', boxShadow: '-2px 0 8px rgba(0,0,0,0.3)', zIndex: 6000, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif', transition: 'transform .2s', transform: open ? 'translateX(0)' : 'translateX(100%)' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #2a2e39', background: '#131722' }}>
        <div style={{ fontWeight: 600, color: '#f8f9fa', fontSize: 12, letterSpacing: '-0.1px' }}>Properties — {node.def?.name || node.type}</div>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #2a2e39', color: '#787b86', cursor: 'pointer', padding: '4px 10px', borderRadius: 4, fontSize: 11, transition: 'all 0.15s' }}>Close</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <div style={{ marginBottom: 12 }}><small style={{ color: '#9ca3af' }}>Edit configuration values for this node.</small></div>
        
        {(!node.def?.config || node.def.config.length === 0) && (
          <div style={{ color: '#9ca3af', padding: '20px 0', textAlign: 'center' }}>No configurable parameters.</div>
        )}
        
        {/* Render ungrouped config items first (Parameters section) */}
        {ungroupedConfig.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ 
              fontSize: 10, 
              fontWeight: 600, 
              color: '#787b86', 
              textTransform: 'uppercase', 
              letterSpacing: '0.5px',
              marginBottom: 12,
              paddingBottom: 6,
              borderBottom: '1px solid #2a2e39'
            }}>
              📊 Parameters
            </div>
            {ungroupedConfig.map(renderConfigItem)}
          </div>
        )}
        
        {/* Render grouped config items (Signal Configuration, etc.) */}
        {Object.entries(groupedConfig).map(([groupName, configs]) => (
          <div key={groupName} style={{ marginBottom: 20 }}>
            <div style={{ 
              fontSize: 10, 
              fontWeight: 600, 
              color: groupName === 'Signal Configuration' ? '#22c55e' : '#787b86', 
              textTransform: 'uppercase', 
              letterSpacing: '0.5px',
              marginBottom: 12,
              paddingBottom: 6,
              borderBottom: `1px solid ${groupName === 'Signal Configuration' ? '#22c55e40' : '#2a2e39'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              {groupName === 'Signal Configuration' ? '🎯' : '⚙️'} {groupName}
            </div>
            {configs.map(renderConfigItem)}
            
            {/* Signal Preview for Signal Configuration group */}
            {groupName === 'Signal Configuration' && (
              <div style={{ 
                marginTop: 12, 
                padding: 10, 
                background: '#131722', 
                borderRadius: 6, 
                border: '1px solid #2a2e39' 
              }}>
                <div style={{ fontSize: 10, color: '#787b86', marginBottom: 6 }}>Signal Preview:</div>
                <div style={{ fontSize: 11, color: '#e5e7eb' }}>
                  {(() => {
                    const mode = values.signalMode || node.def?.config?.find(c => c.key === 'signalMode')?.value || 'default';
                    const direction = values.signalDirection || node.def?.config?.find(c => c.key === 'signalDirection')?.value || 'bullish';
                    const nodeType = node.type?.toLowerCase();
                    
                    const modeDescriptions = {
                      // RSI modes
                      oversold_buy: 'RSI below oversold → BUY signal',
                      overbought_sell: 'RSI above overbought → SELL signal',
                      oversold_signal: 'RSI in oversold zone → True',
                      overbought_signal: 'RSI in overbought zone → True',
                      // EMA/SMA modes
                      price_above: `Price > ${nodeType?.toUpperCase()} → ${direction === 'bullish' ? 'BUY' : 'SELL'}`,
                      price_below: `Price < ${nodeType?.toUpperCase()} → ${direction === 'bullish' ? 'BUY' : 'SELL'}`,
                      crossover_up: `Price crosses above ${nodeType?.toUpperCase()} → Signal`,
                      crossover_down: `Price crosses below ${nodeType?.toUpperCase()} → Signal`,
                      // MACD modes
                      histogram_positive: 'Histogram > 0 → BUY signal',
                      histogram_negative: 'Histogram < 0 → SELL signal',
                      macd_cross_up: 'MACD crosses above signal line → BUY',
                      macd_cross_down: 'MACD crosses below signal line → SELL',
                      histogram_rising: 'Histogram increasing → Momentum building',
                      histogram_falling: 'Histogram decreasing → Momentum fading',
                      // Bollinger modes
                      price_below_lower: 'Price < Lower Band → Oversold',
                      price_above_upper: 'Price > Upper Band → Overbought',
                      price_near_lower: 'Price near Lower Band → Signal',
                      price_near_upper: 'Price near Upper Band → Signal',
                      squeeze: 'Bands narrowing → Breakout expected',
                      // Stochastic modes
                      k_cross_d_up: '%K crosses above %D → BUY',
                      k_cross_d_down: '%K crosses below %D → SELL',
                      // VWAP modes
                      price_near: 'Price near VWAP → Good entry zone',
                      // Volume modes
                      spike_detected: 'Volume spike detected → Confirm move',
                      no_spike: 'No volume spike → Low conviction',
                      rising: 'OBV rising → Bullish volume',
                      falling: 'OBV falling → Bearish volume',
                      // Generic
                      value_only: 'Pass numeric value to next node',
                      above_threshold: 'Value above threshold → True',
                      below_threshold: 'Value below threshold → True',
                    };
                    
                    return modeDescriptions[mode] || `${mode} mode active`;
                  })()}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid #2a2e39', display: 'flex', gap: 8, alignItems: 'center', background: '#131722' }}>
        <button onClick={handleSave} style={{ marginLeft: 'auto', background: '#2962ff', border: '1px solid #2962ff', color: '#fff', cursor: 'pointer', padding: '6px 16px', borderRadius: 4, fontSize: 12, fontWeight: 600, transition: 'all 0.15s' }}>Save Changes</button>
        <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #2a2e39', color: '#787b86', cursor: 'pointer', padding: '6px 16px', borderRadius: 4, fontSize: 12, fontWeight: 500, transition: 'all 0.15s' }}>Discard</button>
      </div>
    </div>
  );
};

export default NodeSettings;
