import React, { useRef, useState, useEffect } from 'react';
import Icon from './Icon';

/**
 * RightPanelContainer - Contains Results Panel (top) and AI Agent Panel (bottom)
 * When no results are showing, AI Agent takes full height
 * When results show, they split 50/50 with smooth transition
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// AI Provider configurations with models
const AI_PROVIDERS = [
  { 
    id: 'openai', 
    name: 'OpenAI', 
    icon: '🤖', 
    keyPrefix: 'sk-',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast & cheap' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Reliable' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5', description: 'Cheapest' }
    ]
  },
  { 
    id: 'gemini', 
    name: 'Gemini', 
    icon: '✨', 
    keyPrefix: 'AIza',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Latest' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable' }
    ]
  },
  { 
    id: 'claude', 
    name: 'Claude', 
    icon: '🧠', 
    keyPrefix: 'sk-ant-',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Latest' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Fast' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most powerful' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Cheapest' }
    ]
  }
];

// ===================== RESULTS PANEL (TOP) =====================
const ResultsPanel = ({ data = {}, onClose = () => {}, onRerun = () => {} }) => {
  const [collapsedSections, setCollapsedSections] = useState(new Set(['raw']));
  const [expandedBlocks, setExpandedBlocks] = useState(new Set());

  const toggleSection = (name) => {
    setCollapsedSections(prev => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  };

  const toggleBlock = (id) => {
    setExpandedBlocks(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const getSignalColor = (signal) => {
    const s = String(signal || '').toUpperCase();
    if (s.includes('BUY') || s.includes('LONG')) return '#10b981';
    if (s.includes('SELL') || s.includes('SHORT')) return '#ef4444';
    return '#6b7280';
  };

  const formatParams = (params) => {
    if (!params || typeof params !== 'object') return params;
    const formatted = {};
    const arrayKeys = ['prices', 'volumes', 'highs', 'lows', 'opens', 'closes', 'price_series', 'volume_history', 'close_history', 'high_history', 'low_history', 'open_history'];
    for (const [key, val] of Object.entries(params)) {
      if (Array.isArray(val) && (arrayKeys.includes(key) || val.length > 10)) {
        const last = val.length > 0 ? val[val.length - 1] : null;
        const lastVal = typeof last === 'number' ? last.toFixed(2) : last;
        formatted[key] = `[${val.length} values${last !== null ? `, last: ${lastVal}` : ''}]`;
      } else {
        formatted[key] = val;
      }
    }
    return formatted;
  };

  const signal = data?.finalSignal || data?.final_decision || '--';
  const signalColor = getSignalColor(signal);

  return (
    <div className="results-panel-inner">
      {/* Header */}
      <div className="results-panel-header">
        <div className="results-panel-title">
          <Icon name="bolt" size={16} />
          <span>Results</span>
        </div>
        <div className="results-panel-actions">
          <button className="results-btn" onClick={onRerun} title="Re-run">
            <Icon name="refresh" size={14} />
          </button>
          <button className="results-btn results-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
      </div>

      {/* Signal Badge */}
      <div className="results-signal-section">
        <div className="results-signal-badge" style={{ background: signalColor }}>
          {signal}
        </div>
        <div className="results-signal-meta">
          <span className="results-meta-item">
            {data?.summary?.symbol || data?.latest_data?.symbol || '--'}
          </span>
          <span className="results-meta-sep">•</span>
          <span className="results-meta-item">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="results-panel-content">
        
        {/* Market Data Section */}
        {data?.latest_data && (
          <div className="results-section">
            <div className="results-section-header" onClick={() => toggleSection('market')}>
              <span className="results-section-title">Market Data</span>
              <span className={`results-section-chevron ${collapsedSections.has('market') ? 'collapsed' : ''}`}>▾</span>
            </div>
            {!collapsedSections.has('market') && (
              <div className="results-section-body">
                <div className="results-grid">
                  {Object.entries(data.latest_data).map(([key, val], idx) => {
                    if (Array.isArray(val)) return null;
                    let label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    let value = val;
                    if (typeof val === 'number') {
                      if (key.toLowerCase().includes('price') || ['open', 'high', 'low', 'close'].includes(key)) {
                        value = '$' + val.toFixed(2);
                      } else if (key.toLowerCase().includes('volume')) {
                        value = val.toLocaleString();
                      } else {
                        value = val.toFixed(4);
                      }
                    }
                    return (
                      <div key={idx} className="results-grid-item">
                        <span className="results-label">{label}</span>
                        <span className="results-value">{String(value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Block Execution Section */}
        {data?.blocks && data.blocks.length > 0 && (
          <div className="results-section">
            <div className="results-section-header" onClick={() => toggleSection('blocks')}>
              <span className="results-section-title">Block Execution</span>
              <span className={`results-section-chevron ${collapsedSections.has('blocks') ? 'collapsed' : ''}`}>▾</span>
            </div>
            {!collapsedSections.has('blocks') && (
              <div className="results-section-body">
                {data.blocks.map((b, idx) => {
                  const expanded = expandedBlocks.has(b.id || idx);
                  const rawParams = b.params || b.inputs || {};
                  
                  const conditionMet = rawParams.condition_met;
                  const hasCond = conditionMet !== undefined;
                  const passed = conditionMet === true;
                  const statusColor = hasCond ? (passed ? '#10b981' : '#ef4444') : '#6b7280';
                  
                  const keyVals = [];
                  if (rawParams.rsi !== undefined) keyVals.push({ k: 'RSI', v: Number(rawParams.rsi).toFixed(2) });
                  if (rawParams.ema !== undefined) keyVals.push({ k: 'EMA', v: Number(rawParams.ema).toFixed(2) });
                  if (rawParams.macd !== undefined) keyVals.push({ k: 'MACD', v: Number(rawParams.macd).toFixed(4) });
                  if (hasCond) keyVals.push({ k: 'Met', v: passed ? '✓' : '✗', color: statusColor });
                  
                  let logPreview = '';
                  if (b.message) logPreview = b.message;
                  else if (b.output && typeof b.output === 'string') logPreview = b.output;
                  else if (b.logs && b.logs.length > 0) logPreview = b.logs[0];
                  else if (rawParams.result !== undefined) logPreview = `Result: ${rawParams.result}`;
                  else if (rawParams.signal !== undefined) logPreview = `Signal: ${rawParams.signal}`;
                  if (logPreview.length > 60) logPreview = logPreview.slice(0, 57) + '...';
                  
                  return (
                    <div key={idx} className={`results-block ${hasCond ? (passed ? 'passed' : 'failed') : ''}`}>
                      <div className="results-block-header" onClick={() => toggleBlock(b.id || idx)}>
                        <div className="results-block-status" style={{ background: statusColor }} />
                        <span className="results-block-name">{b.name || b.block_type || `Block ${idx + 1}`}</span>
                        <span className="results-block-time">{(b.execution_time_ms || 0).toFixed(0)}ms</span>
                        <span className="results-block-expand">{expanded ? '−' : '+'}</span>
                      </div>
                      {logPreview && (
                        <div className="results-block-preview" style={{ color: statusColor }}>
                          {logPreview}
                        </div>
                      )}
                      {keyVals.length > 0 && (
                        <div className="results-block-keys">
                          {keyVals.map((kv, i) => (
                            <span key={i} className="results-block-key" style={kv.color ? { color: kv.color } : {}}>
                              <span className="results-block-key-label">{kv.k}:</span> {kv.v}
                            </span>
                          ))}
                        </div>
                      )}
                      {expanded && (
                        <div className="results-block-details">
                          <pre>{JSON.stringify(formatParams(rawParams), null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Trades Section */}
        {Array.isArray(data?.trades) && data.trades.length > 0 && (
          <div className="results-section">
            <div className="results-section-header" onClick={() => toggleSection('trades')}>
              <span className="results-section-title">Trades ({data.trades.length})</span>
              <span className={`results-section-chevron ${collapsedSections.has('trades') ? 'collapsed' : ''}`}>▾</span>
            </div>
            {!collapsedSections.has('trades') && (
              <div className="results-section-body">
                {data.trades.slice(0, 10).map((t, i) => (
                  <div key={i} className="results-trade-row">
                    <span className="results-trade-side" style={{ color: t.side?.toLowerCase() === 'buy' ? '#10b981' : '#ef4444' }}>
                      {t.side || '--'}
                    </span>
                    <span className="results-trade-price">{t.price ? '$' + Number(t.price).toFixed(2) : '--'}</span>
                    <span className="results-trade-pnl" style={{ color: (t.pnl || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                      {typeof t.pnl !== 'undefined' ? ((t.pnl >= 0 ? '+' : '') + Number(t.pnl).toFixed(2)) : '--'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Raw Response Section */}
        <div className="results-section">
          <div className="results-section-header" onClick={() => toggleSection('raw')}>
            <span className="results-section-title">Raw Response</span>
            <span className={`results-section-chevron ${collapsedSections.has('raw') ? 'collapsed' : ''}`}>▾</span>
          </div>
          {!collapsedSections.has('raw') && (
            <div className="results-section-body">
              <div className="results-raw-box">
                <pre>{JSON.stringify(data || {}, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ===================== AI AGENT PANEL (BOTTOM) =====================
const AIAgentPanel = ({ nodes = [], connections = [], metrics = {}, onAction = () => {}, onClose = () => {} }) => {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState(() => localStorage.getItem('ai_provider') || 'openai');
  const [model, setModel] = useState(() => localStorage.getItem('ai_model') || 'gpt-4o');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(`ai_key_${localStorage.getItem('ai_provider') || 'openai'}`) || '');
  const chatRef = useRef(null);

  // Get current provider config
  const currentProvider = AI_PROVIDERS.find(p => p.id === provider) || AI_PROVIDERS[0];

  // Load API key and set default model when provider changes
  useEffect(() => {
    const savedKey = localStorage.getItem(`ai_key_${provider}`) || '';
    setApiKey(savedKey);
    localStorage.setItem('ai_provider', provider);
    
    // Set default model for this provider if current model doesn't belong to it
    const providerConfig = AI_PROVIDERS.find(p => p.id === provider);
    if (providerConfig) {
      const modelBelongsToProvider = providerConfig.models.some(m => m.id === model);
      if (!modelBelongsToProvider) {
        const defaultModel = providerConfig.models[0]?.id || '';
        setModel(defaultModel);
        localStorage.setItem('ai_model', defaultModel);
      }
    }
  }, [provider]);

  // Save model when it changes
  useEffect(() => {
    localStorage.setItem('ai_model', model);
  }, [model]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const saveApiKey = (key) => {
    setApiKey(key);
    localStorage.setItem(`ai_key_${provider}`, key);
  };

  const sendMessage = async (text) => {
    if (!text.trim() || isLoading) return;
    if (!apiKey) {
      setShowSettings(true);
      return;
    }

    const userMsg = { role: 'user', content: text, timestamp: Date.now() };
    setChatHistory(prev => [...prev, userMsg]);
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          provider,
          model,
          api_key: apiKey,
          context: {
            nodes: nodes.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, params: n.params })),
            connections: connections.map(c => ({ from: c.from, to: c.to })),
            metrics
          },
          history: chatHistory.slice(-10).map(m => ({ role: m.role, content: m.content }))
        })
      });

      const data = await response.json();

      if (data.success && data.response) {
        const aiMsg = {
          role: 'assistant',
          content: data.response.message || 'No response',
          actions: data.response.actions || [],
          timestamp: Date.now()
        };
        setChatHistory(prev => [...prev, aiMsg]);

        // Execute actions if any
        if (aiMsg.actions && aiMsg.actions.length > 0) {
          aiMsg.actions.forEach(action => {
            onAction(action);
          });
        }
      } else {
        const errorMsg = {
          role: 'assistant',
          content: `Error: ${data.error || 'Unknown error'}`,
          isError: true,
          timestamp: Date.now()
        };
        setChatHistory(prev => [...prev, errorMsg]);
      }
    } catch (err) {
      const errorMsg = {
        role: 'assistant',
        content: `Connection error: ${err.message}`,
        isError: true,
        timestamp: Date.now()
      };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestion = (text) => {
    sendMessage(text);
  };

  const clearChat = () => {
    setChatHistory([]);
  };

  // Get current model name
  const currentModel = currentProvider.models.find(m => m.id === model);
  const modelDisplayName = currentModel?.name || model;

  return (
    <div className="ai-agent-panel-inner">
      {/* Header */}
      <div className="ai-agent-header">
        <div className="ai-agent-title">
          <span className="ai-provider-icon">{currentProvider.icon}</span>
          <span className="ai-agent-title-text">
            <span>AI Agent</span>
            <span className="ai-model-badge">{modelDisplayName}</span>
          </span>
        </div>
        <div className="ai-agent-header-actions">
          {chatHistory.length > 0 && (
            <button className="ai-header-btn" onClick={clearChat} title="Clear chat">
              🗑️
            </button>
          )}
          <button 
            className={`ai-header-btn ${showSettings ? 'active' : ''}`} 
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️
          </button>
          <button 
            className="ai-header-btn ai-close-btn" 
            onClick={onClose}
            title="Close AI Agent"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="ai-settings-panel">
          <div className="ai-settings-row">
            <label>Provider</label>
            <select 
              value={provider} 
              onChange={(e) => setProvider(e.target.value)}
              className="ai-settings-select"
            >
              {AI_PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
              ))}
            </select>
          </div>
          <div className="ai-settings-row">
            <label>Model</label>
            <select 
              value={model} 
              onChange={(e) => setModel(e.target.value)}
              className="ai-settings-select"
            >
              {currentProvider.models.map(m => (
                <option key={m.id} value={m.id}>{m.name} - {m.description}</option>
              ))}
            </select>
          </div>
          <div className="ai-settings-row">
            <label>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
              placeholder={`Enter ${currentProvider.name} API key...`}
              className="ai-settings-input"
            />
          </div>
          <div className="ai-settings-hint">
            {apiKey ? '✅ API key saved' : '⚠️ API key required'}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="ai-agent-chat" ref={chatRef}>
        {chatHistory.length === 0 ? (
          <div className="ai-agent-empty">
            <div className="ai-agent-icon">
              <span style={{ fontSize: 32 }}>{currentProvider.icon}</span>
            </div>
            <h3>Strategy Assistant</h3>
            <p>I can help you build strategies, explain indicators, and optimize your workflows.</p>
            <div className="ai-agent-suggestions">
              <button className="ai-suggestion-btn" onClick={() => handleSuggestion('Create a simple RSI oversold strategy for AAPL')}>
                Create RSI strategy
              </button>
              <button className="ai-suggestion-btn" onClick={() => handleSuggestion('Explain how MACD works and when to use it')}>
                Explain MACD
              </button>
              <button className="ai-suggestion-btn" onClick={() => handleSuggestion('What indicators should I add to improve my current strategy?')}>
                Improve my strategy
              </button>
            </div>
          </div>
        ) : (
          <div className="ai-chat-messages">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`ai-chat-message ${msg.role} ${msg.isError ? 'error' : ''}`}>
                <div className="ai-message-avatar">
                  {msg.role === 'user' ? '👤' : currentProvider.icon}
                </div>
                <div className="ai-message-content">
                  <div className="ai-message-text">{msg.content}</div>
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="ai-message-actions">
                      <span className="ai-actions-label">Actions performed:</span>
                      {msg.actions.map((action, i) => (
                        <span key={i} className="ai-action-badge">
                          {action.type === 'add_node' && `➕ Added ${action.block_type}`}
                          {action.type === 'connect' && `🔗 Connected nodes`}
                          {action.type === 'update_node' && `✏️ Updated node`}
                          {action.type === 'remove_node' && `🗑️ Removed node`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="ai-chat-message assistant loading">
                <div className="ai-message-avatar">{currentProvider.icon}</div>
                <div className="ai-message-content">
                  <div className="ai-typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="ai-agent-input-area">
        <input
          type="text"
          className="ai-agent-input"
          placeholder={apiKey ? "Ask the AI agent..." : "Set API key in settings..."}
          value={message}
          disabled={!apiKey}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && message.trim() && !isLoading) {
              sendMessage(message);
            }
          }}
        />
        <button 
          className="ai-agent-send" 
          disabled={!message.trim() || isLoading || !apiKey}
          onClick={() => sendMessage(message)}
        >
          {isLoading ? '...' : '→'}
        </button>
      </div>
    </div>
  );
};


// ===================== MAIN CONTAINER =====================
const RightPanelContainer = ({ 
  resultsOpen = false, 
  resultsData = {}, 
  onCloseResults = () => {}, 
  onRerun = () => {},
  // Canvas control props for AI actions
  nodes = [],
  connections = [],
  metrics = {},
  onAddNode = () => {},
  onConnectNodes = () => {},
  onUpdateNode = () => {},
  onRemoveNode = () => {},
  // AI Agent visibility
  aiAgentOpen = true,
  onCloseAIAgent = () => {}
}) => {
  
  // Handle AI actions
  const handleAIAction = (action) => {
    console.log('AI Action:', action);
    switch (action.type) {
      case 'add_node':
        onAddNode({
          type: action.block_type,
          params: action.params || {},
          x: action.position?.x || 400,
          y: action.position?.y || 200
        });
        break;
      case 'connect':
        onConnectNodes({
          fromNodeId: action.from_node_id,
          fromPort: action.from_port,
          toNodeId: action.to_node_id,
          toPort: action.to_port
        });
        break;
      case 'update_node':
        onUpdateNode(action.node_id, action.params);
        break;
      case 'remove_node':
        onRemoveNode(action.node_id);
        break;
      default:
        console.log('Unknown action type:', action.type);
    }
  };

  return (
    <div className={`right-panel-container ${resultsOpen ? 'has-results' : ''} ${!aiAgentOpen ? 'ai-hidden' : ''}`}>
      {/* Results Panel - Top (expands to full when AI Agent is hidden) */}
      <div className={`right-panel-top ${resultsOpen ? 'visible' : ''} ${!aiAgentOpen && resultsOpen ? 'full' : ''}`}>
        {resultsOpen && (
          <ResultsPanel 
            data={resultsData} 
            onClose={onCloseResults} 
            onRerun={onRerun} 
          />
        )}
      </div>

      {/* AI Agent Panel - Bottom (hidden when aiAgentOpen is false) */}
      {aiAgentOpen && (
        <div className={`right-panel-bottom ${resultsOpen ? 'half' : 'full'}`}>
          <AIAgentPanel 
            nodes={nodes}
            connections={connections}
            metrics={metrics}
            onAction={handleAIAction}
            onClose={onCloseAIAgent}
          />
        </div>
      )}
    </div>
  );
};

export default RightPanelContainer;
