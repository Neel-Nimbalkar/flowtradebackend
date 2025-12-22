import React, { useState, useEffect, useRef } from 'react';

const PerformanceChart = ({ timeframe = '1M' }) => {
  const canvasRef = useRef(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const disableInteraction = true; // Disable hover interaction
  
  // Generate sample performance data based on timeframe
  const generateData = (tf) => {
    const now = new Date();
    const data = [];
    let points;
    let startValue = 10000;
    
    switch (tf) {
      case '1D':
        points = 24;
        break;
      case '1W':
        points = 7;
        break;
      case '1M':
        points = 30;
        break;
      case '3M':
        points = 90;
        break;
      case '1Y':
        points = 365;
        break;
      case 'ALL':
        points = 730;
        break;
      default:
        points = 30;
    }
    
    let value = startValue;
    for (let i = points; i >= 0; i--) {
      const date = new Date(now);
      if (tf === '1D') {
        date.setHours(date.getHours() - i);
      } else {
        date.setDate(date.getDate() - i);
      }
      
      // Random walk with slight upward bias
      const change = (Math.random() - 0.45) * (value * 0.02);
      value += change;
      value = Math.max(value, startValue * 0.5);
      
      data.push({
        date,
        value,
        change
      });
    }
    
    return data;
  };
  
  const [data, setData] = useState(() => generateData(timeframe));
  
  useEffect(() => {
    setData(generateData(timeframe));
  }, [timeframe]);
  
  // Calculate stats
  const startValue = data[0]?.value || 10000;
  const endValue = data[data.length - 1]?.value || 10000;
  const totalReturn = ((endValue - startValue) / startValue) * 100;
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const maxDrawdown = ((maxValue - minValue) / maxValue) * 100;
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Clear canvas
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, width, height);
    
    // Calculate scales
    const values = data.map(d => d.value);
    const minVal = Math.min(...values) * 0.98;
    const maxVal = Math.max(...values) * 1.02;
    
    const xScale = (i) => padding.left + (i / (data.length - 1)) * chartWidth;
    const yScale = (val) => padding.top + chartHeight - ((val - minVal) / (maxVal - minVal)) * chartHeight;
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(48, 54, 61, 0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i / 5) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      
      // Y-axis labels
      const value = maxVal - (i / 5) * (maxVal - minVal);
      ctx.fillStyle = '#8b949e';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText('$' + value.toLocaleString(undefined, { maximumFractionDigits: 0 }), padding.left - 8, y + 4);
    }
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    const isPositive = endValue >= startValue;
    if (isPositive) {
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
    }
    
    // Draw area fill
    ctx.beginPath();
    ctx.moveTo(xScale(0), height - padding.bottom);
    data.forEach((d, i) => {
      ctx.lineTo(xScale(i), yScale(d.value));
    });
    ctx.lineTo(xScale(data.length - 1), height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Draw line
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(data[0].value));
    data.forEach((d, i) => {
      ctx.lineTo(xScale(i), yScale(d.value));
    });
    ctx.strokeStyle = isPositive ? '#3b82f6' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw hovered point
    if (!disableInteraction && hoveredPoint !== null && data[hoveredPoint]) {
      const x = xScale(hoveredPoint);
      const y = yScale(data[hoveredPoint].value);
      
      // Vertical line
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.strokeStyle = 'rgba(139, 148, 158, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Point
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = isPositive ? '#3b82f6' : '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
  }, [data, hoveredPoint, disableInteraction]);
  
  const handleMouseMove = (e) => {
    if (disableInteraction) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = { left: 60, right: 20 };
    const chartWidth = rect.width - padding.left - padding.right;
    
    const index = Math.round(((x - padding.left) / chartWidth) * (data.length - 1));
    if (index >= 0 && index < data.length) {
      setHoveredPoint(index);
    } else {
      setHoveredPoint(null);
    }
  };
  
  const handleMouseLeave = () => {
    if (disableInteraction) return;
    setHoveredPoint(null);
  };
  
  const formatDate = (date) => {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  
  return (
    <div className="performance-chart-container">
      <div className="performance-chart" style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', minHeight: 120, maxHeight: 120 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        {!disableInteraction && hoveredPoint !== null && data[hoveredPoint] && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 70,
              background: '#21262d',
              border: '1px solid #30363d',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              color: '#e6edf3',
              pointerEvents: 'none',
              zIndex: 10
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              ${data[hoveredPoint].value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div style={{ color: '#8b949e' }}>
              {formatDate(data[hoveredPoint].date)}
            </div>
          </div>
        )}
      </div>
      <div className="performance-stats">
        <div className="perf-stat">
          <div className="perf-stat-label">Current Balance</div>
          <div className="perf-stat-value">
            ${endValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="perf-stat">
          <div className="perf-stat-label">Total Return</div>
          <div className={`perf-stat-value ${totalReturn >= 0 ? 'positive' : 'negative'}`}>
            {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
          </div>
        </div>
        <div className="perf-stat">
          <div className="perf-stat-label">Max Drawdown</div>
          <div className="perf-stat-value negative">
            -{maxDrawdown.toFixed(2)}%
          </div>
        </div>
        <div className="perf-stat">
          <div className="perf-stat-label">Starting Balance</div>
          <div className="perf-stat-value">
            ${startValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceChart;
