import React from 'react';

const BackButton = ({ onBack, label = '← Back' }) => {
  return (
    <button onClick={onBack} className="toolbar-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {label}
    </button>
  );
};

export default BackButton;
