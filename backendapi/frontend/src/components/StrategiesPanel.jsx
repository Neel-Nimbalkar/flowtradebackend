import React, { useState, useEffect } from 'react';

const SAVES_KEY = 'flowgrid_workflow_v1::saves';
const ENABLED_STRATEGIES_KEY = 'flowgrid_enabled_strategies';

const StrategiesPanel = ({ onEdit }) => {
  const [strategies, setStrategies] = useState([]);
  const [enabledStrategies, setEnabledStrategies] = useState({});
  
  // Load strategies from localStorage
  const loadStrategies = () => {
    try {
      const raw = localStorage.getItem(SAVES_KEY);
      if (raw) {
        const map = JSON.parse(raw);
        const list = Object.keys(map).map(name => ({
          name,
          savedAt: map[name]?.savedAt || null,
          nodes: map[name]?.nodes || [],
          connections: map[name]?.connections || []
        }));
        // Sort by savedAt descending
        list.sort((a, b) => {
          if (!a.savedAt) return 1;
          if (!b.savedAt) return -1;
          return new Date(b.savedAt) - new Date(a.savedAt);
        });
        setStrategies(list);
      } else {
        setStrategies([]);
      }
    } catch (e) {
      console.error('Error loading strategies:', e);
      setStrategies([]);
    }
  };
  
  // Load enabled strategies state
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
  
  // Save enabled strategies state
  const saveEnabledStrategies = (newState) => {
    try {
      localStorage.setItem(ENABLED_STRATEGIES_KEY, JSON.stringify(newState));
      window.dispatchEvent(new CustomEvent('flowgrid:strategies-updated', { detail: newState }));
    } catch (e) {
      console.error('Error saving enabled strategies:', e);
    }
  };
  
  useEffect(() => {
    loadStrategies();
    loadEnabledStrategies();
    
    // Listen for strategy saves from workflow builder
    const handleStorageChange = (e) => {
      if (e.key === SAVES_KEY) {
        loadStrategies();
      }
    };
    
    const handleStrategySaved = () => {
      loadStrategies();
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('flowgrid:strategy-saved', handleStrategySaved);
    
    // Poll for changes (for same-tab updates)
    const interval = setInterval(loadStrategies, 2000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('flowgrid:strategy-saved', handleStrategySaved);
      clearInterval(interval);
    };
  }, []);
  
  const toggleStrategy = (name) => {
    const newState = {
      ...enabledStrategies,
      [name]: !enabledStrategies[name]
    };
    setEnabledStrategies(newState);
    saveEnabledStrategies(newState);
    
    // Dispatch event so Dashboard and other components stay in sync
    window.dispatchEvent(new CustomEvent('flowgrid:strategy-toggled', {
      detail: { name, enabled: newState[name] }
    }));
  };
  
  const handleEdit = (strategy) => {
    if (onEdit) {
      // Store the strategy to load using the existing load request mechanism
      localStorage.setItem('flowgrid_workflow_v1::load_request', strategy.name);
      // Dispatch event to trigger load in WorkflowBuilder
      window.dispatchEvent(new CustomEvent('flowgrid:load-request', { detail: strategy.name }));
      onEdit(strategy);
    }
  };
  
  const handleDelete = (name) => {
    if (!window.confirm(`Delete strategy "${name}"?`)) return;
    
    try {
      const raw = localStorage.getItem(SAVES_KEY) || '{}';
      const map = JSON.parse(raw);
      delete map[name];
      localStorage.setItem(SAVES_KEY, JSON.stringify(map));
      
      // Also remove from enabled strategies
      const newEnabled = { ...enabledStrategies };
      delete newEnabled[name];
      setEnabledStrategies(newEnabled);
      saveEnabledStrategies(newEnabled);
      
      loadStrategies();
    } catch (e) {
      console.error('Error deleting strategy:', e);
    }
  };
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <div className="strategies-list">
      {strategies.length === 0 ? (
        <div className="empty-strategies">
          <div className="empty-strategies-icon icon-chart"></div>
          <p>No strategies saved yet</p>
          <p style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>
            Create strategies in the Strategy Builder
          </p>
        </div>
      ) : (
        strategies.map((strategy) => (
          <div key={strategy.name} className="strategy-item">
            <label className="strategy-toggle">
              <input
                type="checkbox"
                checked={!!enabledStrategies[strategy.name]}
                onChange={() => toggleStrategy(strategy.name)}
              />
              <span className="toggle-slider"></span>
            </label>
            <div className="strategy-info">
              <div className="strategy-name" title={strategy.name}>
                {strategy.name}
              </div>
              <div className="strategy-date">
                {formatDate(strategy.savedAt)}
              </div>
            </div>
            <div className="strategy-actions">
              <button 
                className="strategy-edit-btn"
                onClick={() => handleEdit(strategy)}
                title="Edit strategy"
              >
                Edit
              </button>
              <button 
                className="strategy-delete-btn"
                onClick={() => handleDelete(strategy.name)}
                title="Delete strategy"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3,6 5,6 21,6"></polyline>
                  <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
                </svg>
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default StrategiesPanel;
