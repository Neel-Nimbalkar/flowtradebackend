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

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, width: 320, height: '100%', background: '#1e222d', borderLeft: '1px solid #2a2e39', boxShadow: '-2px 0 8px rgba(0,0,0,0.3)', zIndex: 6000, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif', transition: 'transform .2s', transform: open ? 'translateX(0)' : 'translateX(100%)' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #2a2e39', background: '#131722' }}>
        <div style={{ fontWeight: 600, color: '#f8f9fa', fontSize: 12, letterSpacing: '-0.1px' }}>Properties — {node.def?.name || node.type}</div>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #2a2e39', color: '#787b86', cursor: 'pointer', padding: '4px 10px', borderRadius: 4, fontSize: 11, transition: 'all 0.15s' }}>Close</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <div style={{ marginBottom: 8 }}><small style={{ color: '#9ca3af' }}>Edit configuration values for this node.</small></div>
        {(!node.def.config || node.def.config.length === 0) && <div style={{ color: '#9ca3af' }}>No configurable parameters.</div>}
        {node.def.config && node.def.config.map(cfg => (
          <div key={cfg.key} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 11, marginBottom: 4 }}>{cfg.label || cfg.key}</label>
            {cfg.type === 'select' ? (
              <select value={values[cfg.key] ?? cfg.value} onChange={e => handleChange(cfg.key, e.target.value)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #2a2e39', background: '#131722', color: '#e5e7eb', fontSize: 11 }}>
                {cfg.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : cfg.type === 'textarea' ? (
              <textarea value={values[cfg.key] ?? cfg.value} onChange={e => handleChange(cfg.key, e.target.value)} style={{ width: '100%', minHeight: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid #2a2e39', background: '#131722', color: '#e5e7eb', fontSize: 11 }} />
            ) : (
              <input type={cfg.type} value={values[cfg.key] ?? cfg.value} onChange={e => handleChange(cfg.key, e.target.value)} style={{ width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid #2a2e39', background: '#131722', color: '#e5e7eb', fontSize: 11 }} />
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
