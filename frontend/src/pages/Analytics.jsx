import React from 'react';
import DashboardSidebar from '../components/DashboardSidebar';
import StrategyMonitorDrawer from '../components/StrategyMonitor/StrategyMonitorDrawer';
import DashboardSettings from '../components/DashboardSettings';
import LiveTrades from '../components/LiveTrades';
import './Dashboard.css';

const Analytics = ({ onNavigate }) => {
  const [monitorOpen, setMonitorOpen] = React.useState(false);
  const [monitorResults, setMonitorResults] = React.useState(null);
  const [monitorNodeBuffers, setMonitorNodeBuffers] = React.useState({});

  React.useEffect(() => {
    try {
      const val = localStorage.getItem('openStrategyMonitor');
      if (val === '1') {
        setMonitorOpen(true);
        localStorage.removeItem('openStrategyMonitor');
      }
    } catch (e) {}

    const id = setInterval(() => {
      try {
        // Prefer cross-tab localStorage payload (works when Analytics is opened in a new tab)
        let rd = null;
        try {
          const raw = localStorage.getItem('monitor_results');
          if (raw) rd = JSON.parse(raw);
        } catch (e) { rd = null; }
        // Fallback to window global if available (same-tab producer)
        if (!rd) rd = window.__monitor_resultsData || null;

        let nb = {};
        try {
          const nraw = localStorage.getItem('monitor_node_buffers');
          if (nraw) nb = JSON.parse(nraw);
        } catch (e) { nb = {}; }
        if (!nb || Object.keys(nb).length === 0) nb = window.__monitor_nodeBuffers || {};

        setMonitorResults(prev => (prev !== rd ? rd : prev));
        setMonitorNodeBuffers(prev => (prev !== nb ? nb : prev));
      } catch (e) {}
    }, 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="dashboard-page">
      <StrategyMonitorDrawer open={monitorOpen} onClose={() => setMonitorOpen(false)} resultsData={monitorResults} nodeBuffers={monitorNodeBuffers} />
      <DashboardSidebar onNavigate={onNavigate} activeRoute="analytics" />
      <main className="dashboard-main">
        <div className="dashboard-header">
          <h1>Analytics</h1>
        </div>
        <div className="dashboard-content" style={{ gridTemplateColumns: '1fr 360px' }}>
          <div className="calendar-panel">
            <div className="calendar-header">
              <span className="calendar-title">Live Trading History</span>
            </div>
            <LiveTrades />
          </div>
          <div className="side-panel">
            <div className="day-stats-panel">
              <div className="day-stats-header">
                <span className="day-stats-title">Alpaca API Settings</span>
              </div>
              <DashboardSettings noWrapper={true} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Analytics;
