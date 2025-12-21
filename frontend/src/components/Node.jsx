import React, { useRef, useEffect, useState } from 'react';
import './node.css';
import Icon from './Icon';
import categoryMeta from '../categoryMeta';
import blockCategoryMap from '../blockCategoryMap';

const Node = ({ node, onUpdatePosition, onDelete, onStartConnection, onEndConnection, onOpenSettings, onUpdateConfig }) => {
  const elRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [noteText, setNoteText] = useState(node.config?.content || '');
  const textAreaRef = useRef(null);

  // Sync note text with node config
  useEffect(() => {
    setNoteText(node.config?.content || '');
  }, [node.config?.content]);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
  }, [node.x, node.y]);

  // Auto-focus textarea when editing starts
  useEffect(() => {
    if (isEditing && textAreaRef.current) {
      textAreaRef.current.focus();
      textAreaRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    let moveHandler = null;
    let upHandler = null;

    // rAF-throttled pointer/mouse move handling for smoother dragging
    const rafRefLocal = { current: null };
    const targetPosLocal = { x: null, y: null };

    const scheduleUpdate = (id) => {
      if (rafRefLocal.current) return;
      rafRefLocal.current = window.requestAnimationFrame(() => {
        rafRefLocal.current = null;
        if (targetPosLocal.x !== null && targetPosLocal.y !== null) {
          onUpdatePosition(id, targetPosLocal.x, targetPosLocal.y);
        }
      });
    };

    if (dragging) {
      moveHandler = (e) => {
        try { e.preventDefault(); } catch (err) {}
        const pageX = (typeof e.pageX !== 'undefined') ? e.pageX : (e.touches && e.touches[0] && e.touches[0].pageX) || 0;
        const pageY = (typeof e.pageY !== 'undefined') ? e.pageY : (e.touches && e.touches[0] && e.touches[0].pageY) || 0;
        const nx = pageX - dragOffset.current.x;
        const ny = pageY - dragOffset.current.y;
        targetPosLocal.x = nx; targetPosLocal.y = ny;
        scheduleUpdate(node.id);
      };

      upHandler = (e) => {
        setDragging(false);
        if (rafRefLocal.current) { window.cancelAnimationFrame(rafRefLocal.current); rafRefLocal.current = null; }
        document.removeEventListener('pointermove', moveHandler);
        document.removeEventListener('pointerup', upHandler);
        document.removeEventListener('mousemove', moveHandler);
        document.removeEventListener('mouseup', upHandler);
      };

      document.addEventListener('pointermove', moveHandler, { passive: false });
      document.addEventListener('pointerup', upHandler);
      document.addEventListener('mousemove', moveHandler, { passive: false });
      document.addEventListener('mouseup', upHandler);
    }

    return () => {
      if (moveHandler) {
        document.removeEventListener('pointermove', moveHandler);
        document.removeEventListener('mousemove', moveHandler);
      }
      if (upHandler) {
        document.removeEventListener('pointerup', upHandler);
        document.removeEventListener('mouseup', upHandler);
      }
      if (rafRefLocal.current) { window.cancelAnimationFrame(rafRefLocal.current); rafRefLocal.current = null; }
    };
  }, [dragging]);

  const dragOffset = useRef({ x: 0, y: 0 });
  // refs used for potential further smoothing/extensions
  const rafRef = useRef(null);
  const targetPos = useRef({ x: null, y: null });


  // Only allow drag from header, not whole node
  const onHeaderPointerDown = (e) => {
    // For mouse pointer ensure primary button
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button')) return;
    try { e.preventDefault(); } catch (err) {}
    try { e.target.setPointerCapture && e.target.setPointerCapture(e.pointerId); } catch (err) {}
    const nodeX = node.x;
    const nodeY = node.y;
    const pageX = (typeof e.pageX !== 'undefined') ? e.pageX : (e.touches && e.touches[0] && e.touches[0].pageX) || 0;
    const pageY = (typeof e.pageY !== 'undefined') ? e.pageY : (e.touches && e.touches[0] && e.touches[0].pageY) || 0;
    dragOffset.current = { x: pageX - nodeX, y: pageY - nodeY };
    setDragging(true);
  };

  // Handle text box click to start editing
  const handleTextBoxClick = (e) => {
    e.stopPropagation();
    if (!isEditing) {
      setIsEditing(true);
    }
  };

  // Handle text change
  const handleTextChange = (e) => {
    setNoteText(e.target.value);
  };

  // Handle blur to save and exit editing
  const handleTextBlur = () => {
    setIsEditing(false);
    if (onUpdateConfig && noteText !== (node.config?.content || '')) {
      onUpdateConfig(node.id, { ...node.config, content: noteText });
    }
  };

  // Handle keyboard shortcuts in textarea
  const handleTextKeyDown = (e) => {
    if (e.key === 'Escape') {
      setNoteText(node.config?.content || '');
      setIsEditing(false);
    }
    // Stop propagation to prevent canvas shortcuts while editing
    e.stopPropagation();
  };

  const execClass = node.execStatus === 'executing' ? 'executing' : node.execStatus === 'passed' ? 'node-passed' : node.execStatus === 'failed' ? 'node-failed' : node.execStatus === 'skipped' ? 'node-skipped' : '';

  // Check if this is a text note node
  const isTextBox = node.type === 'note' || node.def?.isTextBox;

  // Render text box node differently
  if (isTextBox) {
    return (
      <div 
        className={`node text-note-node${node.selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${isEditing ? ' editing' : ''}`} 
        id={`node-${node.id}`} 
        ref={elRef} 
        style={{ left: node.x, top: node.y, position: 'absolute', userSelect: dragging ? 'none' : 'auto' }}
      >
        <div className="text-note-header" onPointerDown={onHeaderPointerDown} style={{ cursor: 'grab', userSelect: 'none' }}>
          <div className="node-icon color-note">
            <Icon name="note" size={14} />
          </div>
          <span className="text-note-label">Note</span>
          <button
            type="button"
            className="node-delete"
            onMouseDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); }}
            onClick={(ev) => { ev.stopPropagation(); onDelete(node.id); }}
          >×</button>
        </div>
        <div className="text-note-content" onClick={handleTextBoxClick}>
          {isEditing ? (
            <textarea
              ref={textAreaRef}
              className="text-note-textarea"
              value={noteText}
              onChange={handleTextChange}
              onBlur={handleTextBlur}
              onKeyDown={handleTextKeyDown}
              placeholder="Click to add note..."
              rows={3}
            />
          ) : (
            <div className="text-note-display">
              {noteText || <span className="text-note-placeholder">Click to add note...</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`node${node.selected ? ' selected' : ''}${execClass ? ' ' + execClass : ''}${dragging ? ' dragging' : ''}`} id={`node-${node.id}`} ref={elRef} style={{ left: node.x, top: node.y, position: 'absolute', userSelect: dragging ? 'none' : 'auto' }}>
      <div className="node-header" onPointerDown={onHeaderPointerDown} style={{ cursor: 'grab', userSelect: 'none' }}>
        <div className={`node-icon ${node.def?.color || ''}`}>
          {node.def?.icon ? (
            <Icon name={node.def.icon} size={18} />
          ) : (
            (categoryMeta[blockCategoryMap[node.type]] && categoryMeta[blockCategoryMap[node.type]].icon) || '▦'
          )}
        </div>
        <div className="node-title">{node.def?.name || node.type}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {(node.def && Array.isArray(node.def.config) && node.def.config.length > 0) && (
              <button
                type="button"
                className="node-settings"
                onMouseDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); }}
                onClick={(ev) => { ev.stopPropagation(); if (onOpenSettings) onOpenSettings(node); }}
                title="Settings"
              > <Icon name="plus" size={14} /> </button>
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
