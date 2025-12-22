import React from 'react';
import Icon from './Icon';

const DashboardHeader = () => {
  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 18 }}>FLOWTRADE</div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}></div>
    </div>
  );
};

export default DashboardHeader;
