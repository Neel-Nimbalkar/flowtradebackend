import React, { useRef, useEffect, useState } from 'react';
import './node.css';

const Node = ({ node, onUpdatePosition, onDelete, onStartConnection, onEndConnection, onOpenSettings }) => {
  const elRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
  }, [node.x, node.y]);

  useEffect(() => {
    let moveHandler = null;
    let upHandler = null;

    if (dragging) {
      moveHandler = (e) => {
        e.preventDefault();
        const nx = e.pageX - dragOffset.current.x;
        const ny = e.pageY - dragOffset.current.y;
        onUpdatePosition(node.id, nx, ny);
      };

      upHandler = (e) => {
        setDragging(false);
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
      };

      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', upHandler);
    }

    return () => {
      if (moveHandler) document.removeEventListener('mousemove', moveHandler);
      if (upHandler) document.removeEventListener('mouseup', upHandler);
    };
  }, [dragging]);

  const dragOffset = useRef({ x: 0, y: 0 });


  // Only allow drag from header, not whole node
  const onHeaderMouseDown = (e) => {
    if (e.button !== 0) return;
    // Only start drag if not clicking a button
    if (e.target.closest('button')) return;
    e.preventDefault();
    // Use page coordinates to avoid jump
    const nodeX = node.x;
    const nodeY = node.y;
    dragOffset.current = { x: e.pageX - nodeX, y: e.pageY - nodeY };
    setDragging(true);
  };

  const execClass = node.execStatus === 'executing' ? 'executing' : node.execStatus === 'passed' ? 'node-passed' : node.execStatus === 'failed' ? 'node-failed' : node.execStatus === 'skipped' ? 'node-skipped' : '';

  return (
    <div className={`node${node.selected ? ' selected' : ''}${execClass ? ' ' + execClass : ''}${dragging ? ' dragging' : ''}`} id={`node-${node.id}`} ref={elRef} style={{ left: node.x, top: node.y, position: 'absolute', userSelect: dragging ? 'none' : 'auto' }}>
      <div className="node-header" onMouseDown={onHeaderMouseDown} style={{ cursor: 'grab', userSelect: 'none' }}>
        <div className={`node-icon ${node.def?.color || ''}`}>{node.def?.icon || '▦'}</div>
        <div className="node-title">{node.def?.name || node.type}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {(node.def && Array.isArray(node.def.config) && node.def.config.length > 0) && (
              <button
                type="button"
                className="node-settings"
                onMouseDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); }}
                onClick={(ev) => { ev.stopPropagation(); if (onOpenSettings) onOpenSettings(node); }}
                title="Settings"
              >⚙</button>
            )}
            <button
              type="button"
              className="node-delete"
              onMouseDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); }}
              onClick={(ev) => { ev.stopPropagation(); onDelete(node.id); }}
            >×</button>
        </div>
      </div>
      <div className="node-body">
        <div className="node-inputs">
          {node.def?.inputs?.map(inp => (
            <div key={inp} className="node-port input" data-port={inp} data-node-id={node.id} data-port-type="input">
              <span
                className="port-dot"
                data-port={inp}
                data-node-id={node.id}
                data-port-type="input"
                onMouseUp={(e) => { e.stopPropagation(); if (onEndConnection) onEndConnection(node.id, inp, 'input'); }}
              ></span>
              <span>{inp}</span>
            </div>
          ))}
        </div>
        <div className="node-outputs">
          {node.def?.outputs?.map(out => (
            <div key={out} className="node-port output" data-port={out} data-node-id={node.id} data-port-type="output">
              <span>{out}</span>
              <span
                className="port-dot"
                data-port={out}
                data-node-id={node.id}
                data-port-type="output"
                onClick={(e) => { e.stopPropagation(); if (onStartConnection) onStartConnection(node.id, out, 'output'); }}
              ></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Node;
