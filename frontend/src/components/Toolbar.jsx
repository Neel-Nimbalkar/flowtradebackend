import React from 'react';

const Toolbar = ({ onSave, onLoad, onExport, onImport, onClear, onOrganize, onRun, onSample, onToggleMonitor, onRunToggle, onBacktest, liveRunning, extraBefore = null }) => {
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
      <button className="toolbar-btn" id="organizeBtn" onClick={callOrLegacy('organizeBtn', onOrganize)} title="Auto-arrange blocks">Organize</button>
      <button className="toolbar-btn" id="clearBtn" onClick={callOrLegacy('clearBtn', onClear)}>Clear</button>
      <button className="toolbar-btn" id="saveBtn" onClick={callOrLegacy('saveBtn', onSave)} title="Save workflow">Save</button>
      <button className="toolbar-btn" id="loadBtn" onClick={callOrLegacy('loadBtn', onLoad)} title="Load workflow">Load</button>
      <button className="toolbar-btn" id="importBtn" onClick={callOrLegacy('importBtn', onImport)} title="Load workflow from file">Import</button>
      <button className="toolbar-btn" id="loadSampleBtn" onClick={callOrLegacy('loadSampleBtn', onSample)} title="Load a demo workflow">Load Sample</button>
      <button className="toolbar-btn" id="exportBtn" onClick={callOrLegacy('exportBtn', onExport)}>Export</button>
      <button className="toolbar-btn" id="backTestingBtn" onClick={callOrLegacy('backTestingBtn', onBacktest)} title="Back Testing">Back Testing</button>
      <button className="toolbar-btn" id="monitorBtn" onClick={callOrLegacy('monitorBtn', onToggleMonitor)} title="Open Monitor">Monitor</button>
      <div className="toolbar-run">
        <label id="runBtn" className={`run-switch ${liveRunning ? 'on' : 'off'}`} title="Toggle continuous run">
          <input aria-label="Run Strategy" type="checkbox" checked={!!liveRunning} onChange={() => { if (onRunToggle) onRunToggle(); else callOrLegacy('runBtn', onRun)(); }} />
          <span className="slider" />
        </label>
      </div>
    </div>
  );
};

export default Toolbar;
