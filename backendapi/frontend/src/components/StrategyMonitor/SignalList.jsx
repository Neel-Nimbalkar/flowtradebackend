import React from 'react';
import SignalItem from './SignalItem';

const SignalList = ({ signals = [] }) => {
  if (!signals || signals.length === 0) return <div className="muted">No signals available.</div>;
  return (
    <div className="signal-list">
      {signals.map(s => <SignalItem key={s.id} signal={s} />)}
    </div>
  );
};

export default SignalList;
