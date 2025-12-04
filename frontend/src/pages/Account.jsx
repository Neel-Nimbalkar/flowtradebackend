import React from 'react';
import DashboardSettings from '../components/DashboardSettings';

const Account = ({ onNavigate }) => {
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Account & Settings</h2>
      <div style={{ maxWidth: 720 }}>
        <DashboardSettings />
      </div>
    </div>
  );
};

export default Account;
