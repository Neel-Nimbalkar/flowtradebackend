import React from 'react';

const AIAnalysis = ({ aiAnalysis, latestSignal }) => {
  if (!aiAnalysis || !latestSignal) return (
    <div className="sr-ai-muted">AI analysis will appear when a signal is confirmed.</div>
  );
  return (
    <div className="sr-ai-analysis">
      <div className="sr-section-title">AI Strategy Analysis</div>
      <div className="sr-ai-text">{aiAnalysis}</div>
    </div>
  );
};

export default AIAnalysis;
