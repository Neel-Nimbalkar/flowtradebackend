import React from 'react';
import LiveMonitorTab from './LiveMonitorTab';
import BacktestTab from './BacktestTab';
import PastSignalsTab from './PastSignalsTab';
import InsightsTab from './InsightsTab';
import LegacyMonitorTab from './LegacyMonitorTab';

const MonitorTabs = ({ active, onChange, resultsData = null, nodeBuffers = {} }) => {
  return (
    <div className="monitor-tabs">
      <div className="tab-content">
        {active === 'live' && <LiveMonitorTab data={resultsData} nodeBuffers={nodeBuffers} />}
        {active === 'backtest' && <BacktestTab data={resultsData} />}
        {active === 'past' && <PastSignalsTab data={resultsData} />}
        {active === 'insights' && <InsightsTab data={resultsData} />}
        {active === 'legacy' && <LegacyMonitorTab data={resultsData} />}
      </div>
    </div>
  );
};

export default MonitorTabs;
