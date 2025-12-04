import React from 'react';
import DashboardSidebar from '../components/DashboardSidebar';
import StrategyMonitorDrawer from '../components/StrategyMonitor/StrategyMonitorDrawer';
import DashboardSettings from '../components/DashboardSettings';
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
    <div className="dashboard-root">
      <StrategyMonitorDrawer open={monitorOpen} onClose={() => setMonitorOpen(false)} resultsData={monitorResults} nodeBuffers={monitorNodeBuffers} />
      <DashboardSidebar onNavigate={onNavigate} hideHome={false} activeKey={'analytics'} />
      <div className="dashboard-content">
        <div className="dashboard-main">
          <div className="grid" style={{ gridTemplateColumns: '1fr 3fr 360px', gap: 16 }}>
            <div className="panel large" style={{ gridColumn: '1 / span 2', gridRow: '1', minWidth: 0 }}>
              <div className="panel-header">Analytics</div>
              <div className="panel-body">
                <div style={{ padding: 8 }}>Analytics workspace — Strategy Monitor is available on the right.</div>
              </div>
            </div>

            <div className="panel" style={{ gridColumn: '3', gridRow: '1', minHeight: 300 }}>
              <div className="panel-header">Alpaca API Settings</div>
              <DashboardSettings noWrapper={true} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
