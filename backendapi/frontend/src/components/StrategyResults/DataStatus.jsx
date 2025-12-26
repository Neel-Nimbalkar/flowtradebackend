import React from 'react';

const DataStatus = ({ latency = null, apiStatus = null }) => {
  const ok = apiStatus === true || apiStatus === 'ok' || apiStatus === 'connected';
  return (
    <div className="sr-data-status">
      <div className="sr-section-title">Data & Status</div>
      <div className="sr-ds-row"><strong>API:</strong> <span className={`sr-status ${ok ? 'ok' : 'bad'}`}>{apiStatus ? apiStatus.toString() : 'unknown'}</span></div>
      <div className="sr-ds-row"><strong>Latency:</strong> {latency !== null ? `${latency} ms` : '—'}</div>
    </div>
  );
};

export default DataStatus;
