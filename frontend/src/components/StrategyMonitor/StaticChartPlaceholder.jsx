import React from 'react';

const StaticChartPlaceholder = ({ height = 160 }) => {
  return (
    <div style={{ width: '100%', height, background: 'linear-gradient(90deg,#071122, #06121a)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
      <div>Chart placeholder</div>
    </div>
  );
};

export default StaticChartPlaceholder;
