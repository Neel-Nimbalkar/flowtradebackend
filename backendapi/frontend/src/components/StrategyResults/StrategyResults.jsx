import React from 'react';
import './strategy-results.css';
import PriceChart from './PriceChart';
import IndicatorChart from './IndicatorChart';
import SignalSummary from './SignalSummary';
import PerformanceChart from './PerformanceChart';
import ExecutionBreakdown from './ExecutionBreakdown';
import MarketContext from './MarketContext';
import RecentSignals from './RecentSignals';
import AIAnalysis from './AIAnalysis';
import DataStatus from './DataStatus';

const StrategyResults = ({
  priceBars = [],
  signals = [],
  indicatorData = {},
  workflowResults = {},
  aiAnalysis = null,
  marketContext = {},
  latency = null,
  apiStatus = null,
  style = {}
}) => {
  const latestSignal = signals && signals.length ? signals[0] : null;

  return (
    <div className="sr-root" style={style}>
      <div className="sr-left">
        <div className="sr-panel sr-panel-lg">
          <PriceChart priceBars={priceBars} signals={signals} />
        </div>

        <div className="sr-row">
          <div className="sr-panel sr-panel-md">
            <IndicatorChart indicatorData={indicatorData} />
          </div>
          <div className="sr-panel sr-panel-sm">
            <SignalSummary latestSignal={latestSignal} latestData={workflowResults.latest_data || {}} />
            <DataStatus latency={latency} apiStatus={apiStatus} />
          </div>
        </div>

        <div className="sr-panel sr-panel-lg">
          <PerformanceChart priceBars={priceBars} signals={signals} />
        </div>
      </div>

      <div className="sr-right">
        <div className="sr-panel sr-panel-sm">
          <ExecutionBreakdown workflowResults={workflowResults} />
        </div>

        <div className="sr-panel sr-panel-sm">
          <MarketContext marketContext={marketContext} />
        </div>

        <div className="sr-panel sr-panel-md">
          <RecentSignals signals={signals} />
        </div>

        <div className="sr-panel sr-panel-md">
          <AIAnalysis aiAnalysis={aiAnalysis} latestSignal={latestSignal} />
        </div>
      </div>
    </div>
  );
};

export default StrategyResults;
