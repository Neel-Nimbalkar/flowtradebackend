import React from 'react';
import DashboardSidebar from '../components/DashboardSidebar';
import DashboardSettings from '../components/DashboardSettings';
import './Dashboard.css';

const Account = ({ onNavigate }) => {
  return (
    <div className="dashboard-page">
      <DashboardSidebar onNavigate={onNavigate} activeRoute="settings" />
      <main className="dashboard-main">
        <div className="dashboard-header">
          <h1>Account & Settings</h1>
        </div>
        <div className="calendar-panel" style={{ maxWidth: 720 }}>
          <DashboardSettings />
        </div>
      </main>
    </div>
  );
};

export default Account;
