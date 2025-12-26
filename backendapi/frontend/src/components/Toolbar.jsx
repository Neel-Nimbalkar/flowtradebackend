import React from 'react';

const Toolbar = ({ onSave, onLoad, onExport, onImport, onClear, onOrganize, onRun, onSample, onToggleMonitor, onRunToggle, onBacktest, liveRunning, extraBefore = null, onNew = null }) => {
  const callOrLegacy = (id, cb) => () => {
    if (cb) return cb();
    const el = document.getElementById(id);
    if (el) el.click();
    else {
      if (id === 'organizeBtn' && window.organizeWorkflow) window.organizeWorkflow();
      if (id === 'runBtn' && window.runWorkflow) window.runWorkflow();
    }
  };

  return (
    <div className="toolbar">
      {extraBefore}
      {/* Layout group */}
      <button className="toolbar-btn" id="organizeBtn" onClick={callOrLegacy('organizeBtn', onOrganize)} title="Auto-arrange blocks">Organize</button>
      <button className="toolbar-btn" id="clearBtn" onClick={callOrLegacy('clearBtn', onClear)} title="Clear canvas">Clear</button>
      
      {/* File operations group */}
      <div style={{ width: '1px', height: '20px', background: 'var(--border, #2a2e39)', margin: '0 4px' }} />
      <button className="toolbar-btn" id="saveBtn" onClick={callOrLegacy('saveBtn', onSave)} title="Save workflow">Save</button>
      <button className="toolbar-btn" id="importBtn" onClick={callOrLegacy('importBtn', onImport)} title="Load workflow from file">Import</button>
      <button className="toolbar-btn" id="exportBtn" onClick={callOrLegacy('exportBtn', onExport)} title="Export workflow">Export</button>
      
      {/* Run control - pushed to right */}
      <div className="toolbar-run">
        <span>Run Strategy</span>
        <label id="runBtn" className={`run-switch ${liveRunning ? 'on' : 'off'}`} title="Toggle continuous run">
          <input aria-label="Run Strategy" type="checkbox" checked={!!liveRunning} onChange={() => { if (onRunToggle) onRunToggle(); else callOrLegacy('runBtn', onRun)(); }} />
          <span className="slider" />
        </label>
      </div>
    </div>
  );
};

export default Toolbar;
