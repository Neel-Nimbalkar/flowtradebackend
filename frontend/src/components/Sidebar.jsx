import React, { useState } from 'react';
import blockDefs from '../blockDefs';
import Icon from './Icon';
import categoryMeta from '../categoryMeta';
import blockCategoryMap from '../blockCategoryMap';
import { getTemplateList } from '../strategyTemplates';

// Get pre-made strategy templates
const templateItems = getTemplateList();

const blocks = [
  { category: 'Strategies', items: templateItems.map(t => ({ ...t, color: 'color-strategy' })) },
  { category: 'Configuration', items: [
    { ...blockDefs.input, type: 'input' },
    { ...blockDefs.price_history, type: 'price_history' },
    { ...blockDefs.volume_history, type: 'volume_history' }
  ] },
  { category: 'Indicators', items: [
    { ...blockDefs.rsi, type: 'rsi' },
    { ...blockDefs.sma, type: 'sma' },
    { ...blockDefs.ema, type: 'ema' },
    { ...blockDefs.macd, type: 'macd' },
    { ...blockDefs.atr, type: 'atr' },
    { ...blockDefs.obv, type: 'obv' },
    { ...blockDefs.bollinger, type: 'bollinger' },
    { ...blockDefs.stochastic, type: 'stochastic' },
    { ...blockDefs.vwap, type: 'vwap' },
    { ...blockDefs.volume_spike, type: 'volume_spike' },
    { ...blockDefs.price_levels, type: 'price_levels' },
    { ...blockDefs.support_resistance, type: 'support_resistance' }
  ] },
  { category: 'Logic', items: [
    { ...blockDefs.and, type: 'and' },
    { ...blockDefs.or, type: 'or' },
    { ...blockDefs.not, type: 'not' },
    { ...blockDefs.compare, type: 'compare' },
    { ...blockDefs.crossover, type: 'crossover' },
    { ...blockDefs.threshold, type: 'threshold' }
  ] },
  { category: 'Filters', items: [
    { ...blockDefs.time_filter, type: 'time_filter' },
    { ...blockDefs.trend_filter, type: 'trend_filter' },
    { ...blockDefs.volume_filter, type: 'volume_filter' }
  ] },
  { category: 'AI & Output', items: [
    { ...blockDefs.ai_agent, type: 'ai_agent' },
    { ...blockDefs.output, type: 'output' }
  ] },
  { category: 'Utility', items: [ { ...blockDefs.note, type: 'note' } ] }
];

const Sidebar = () => {
  // Track collapsed state for each category - all start collapsed
  const [collapsed, setCollapsed] = useState(() => {
    const initial = {};
    blocks.forEach(cat => { initial[cat.category] = true; });
    return initial;
  });
  // Track search text for each category
  const [search, setSearch] = useState({});

  const toggleCollapse = (cat) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };
  const handleSearch = (cat, val) => {
    setSearch(prev => ({ ...prev, [cat]: val }));
  };

  return (
    <div className="sidebar node-palette">
      <div className="sidebar-header">
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#f8f9fa', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Node Palette</h2>
        <p>Drag blocks to canvas to build your strategy</p>
      </div>

      <div className="node-palette-scroll">
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
    </div>
  );
};

export default Sidebar;
