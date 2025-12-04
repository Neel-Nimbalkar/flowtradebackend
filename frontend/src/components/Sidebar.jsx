import React, { useState } from 'react';
import blockDefs from '../blockDefs';
import Icon from './Icon';
import categoryMeta from '../categoryMeta';
import blockCategoryMap from '../blockCategoryMap';

const blocks = [
    { category: 'Templates', items: [
    { type: 'template-golden-cross', name: 'Golden Cross', desc: '50/200 SMA crossover', icon: 'puzzle' },
    { type: 'template-rsi-volume', name: 'RSI + Volume Spike', desc: 'Oversold with volume confirmation', icon: 'puzzle' }
  ]},
  { category: 'Configuration', items: [
    { ...blockDefs.input, type: 'input' },
    { ...blockDefs.price_history, type: 'price_history' },
    { ...blockDefs.volume_history, type: 'volume_history' }
  ] },
  { category: 'Indicators', items: [
    { ...blockDefs.rsi, type: 'rsi' },
    { ...blockDefs.ema, type: 'ema' },
    { ...blockDefs.macd, type: 'macd' },
    { ...blockDefs.atr, type: 'atr' },
    { ...blockDefs.obv, type: 'obv' },
    { ...blockDefs.bollinger, type: 'bollinger' },
    { ...blockDefs.stochastic, type: 'stochastic' },
    { ...blockDefs.vwap, type: 'vwap' },
    { ...blockDefs.volume_spike, type: 'volume_spike' }
  ] },
  { category: 'Logic', items: [
    { ...blockDefs.and, type: 'and' },
    { ...blockDefs.or, type: 'or' },
    { ...blockDefs.not, type: 'not' },
    { ...blockDefs.compare, type: 'compare' }
  ] },
  { category: 'AI & Output', items: [
    { ...blockDefs.ai_agent, type: 'ai_agent' },
    { ...blockDefs.output, type: 'output' },
    { ...blockDefs.signal, type: 'signal' }
  ] },
  { category: 'Utility', items: [ { ...blockDefs.note, type: 'note' } ] }
];

const Sidebar = () => {
  // Track collapsed state for each category
  const [collapsed, setCollapsed] = useState({});
  // Track search text for each category
  const [search, setSearch] = useState({});

  const toggleCollapse = (cat) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };
  const handleSearch = (cat, val) => {
    setSearch(prev => ({ ...prev, [cat]: val }));
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#2962ff', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#5e8cff', stopOpacity: 1 }} />
              </linearGradient>
            </defs>
            <path d="M4 8 L16 8 L16 12 L4 12 Z" fill="url(#logoGradient)" opacity="0.9" />
            <path d="M4 14 L28 14 L28 18 L4 18 Z" fill="url(#logoGradient)" />
            <path d="M4 20 L22 20 L22 24 L4 24 Z" fill="url(#logoGradient)" opacity="0.8" />
            <circle cx="26" cy="10" r="2" fill="#5e8cff" />
            <circle cx="24" cy="22" r="2" fill="#2962ff" />
          </svg>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f8f9fa', margin: 0 }}>FLOWTRADE</h2>
        </div>
        <p>Drag blocks to canvas to build your strategy</p>
      </div>

      {blocks.map((cat) => (
        <div className={`block-category${collapsed[cat.category] ? ' collapsed' : ''}`} key={cat.category}>
          <div
            className="category-title"
            onClick={() => toggleCollapse(cat.category)}
            title={categoryMeta[cat.category]?.desc || ''}
            aria-label={categoryMeta[cat.category]?.desc || ''}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{categoryMeta[cat.category]?.icon || null}</span>
              <span>{cat.category}</span>
            </span>
          </div>
          <div className="category-blocks">
            <input
              type="text"
              className="category-search"
              placeholder={`Search ${cat.category.toLowerCase()}...`}
              value={search[cat.category] || ''}
              onChange={e => handleSearch(cat.category, e.target.value)}
            />
            {cat.items
              .filter(it =>
                !search[cat.category] ||
                it.name.toLowerCase().includes(search[cat.category].toLowerCase()) ||
                (it.desc && it.desc.toLowerCase().includes(search[cat.category].toLowerCase()))
              )
              .map(it => (
                <div key={it.type} className="block-item" draggable="true" data-block-type={it.type} onDragStart={(e) => e.dataTransfer.setData('blockType', it.type)}>
                  <div className={`block-icon ${it.color || ''}`}>
                    {it.icon ? <Icon name={it.icon} size={14} /> : (categoryMeta[cat.category]?.icon || null)}
                  </div>
                  <div className="block-info">
                    <div className="block-name">{it.name}</div>
                    <div className="block-desc">{it.desc}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Sidebar;
