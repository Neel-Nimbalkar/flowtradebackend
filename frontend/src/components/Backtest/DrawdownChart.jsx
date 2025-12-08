import React, { useEffect, useRef, useState, useCallback } from 'react';
import './DrawdownChart.css';

const DrawdownChart = ({ data, trades }) => {
  const canvasRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const chartDataRef = useRef({});

  useEffect(() => {
    if (!data || data.length === 0) return;
    calculateStats();
    drawChart();
  }, [data, hoveredPoint]);

  const calculateStats = () => {
    if (!data || data.length < 2) return;
    
    const drawdowns = data.map(d => d.drawdown || 0);
    const maxDD = Math.max(...drawdowns);
    
    // Find drawdown periods
    let periods = [];
    let inDrawdown = false;
    let periodStart = null;
    let periodPeak = 0;
    
    for (let i = 0; i < data.length; i++) {
      const dd = data[i].drawdown || 0;
      if (dd > 0 && !inDrawdown) {
        inDrawdown = true;
        periodStart = i;
        periodPeak = dd;
      } else if (dd > periodPeak && inDrawdown) {
        periodPeak = dd;
      } else if (dd === 0 && inDrawdown) {
        periods.push({
          start: periodStart,
          end: i,
          duration: i - periodStart,
          peak: periodPeak,
          startTime: data[periodStart].time,
          endTime: data[i].time
        });
        inDrawdown = false;
        periodPeak = 0;
      }
    }
    
    // If still in drawdown
    if (inDrawdown) {
      periods.push({
        start: periodStart,
        end: data.length - 1,
        duration: data.length - 1 - periodStart,
        peak: periodPeak,
        startTime: data[periodStart].time,
        endTime: data[data.length - 1].time,
        ongoing: true
      });
    }
    
    // Sort by peak drawdown
    periods.sort((a, b) => b.peak - a.peak);
    
    const avgDD = drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length;
    const timeInDrawdown = drawdowns.filter(d => d > 0).length;
    const timeInDrawdownPct = (timeInDrawdown / drawdowns.length) * 100;
    
    // Calculate average drawdown duration
    const avgDuration = periods.length > 0 
      ? periods.reduce((sum, p) => sum + p.duration, 0) / periods.length 
      : 0;
    
    // Longest drawdown
    const longestDD = periods.length > 0 
      ? periods.reduce((max, p) => p.duration > max.duration ? p : max, periods[0])
      : null;
    
    // Recovery time (time from max DD to recovery)
    const maxDDIndex = drawdowns.indexOf(maxDD);
    let recoveryTime = null;
    for (let i = maxDDIndex; i < drawdowns.length; i++) {
      if (drawdowns[i] === 0) {
        recoveryTime = i - maxDDIndex;
        break;
      }
    }
    
    setStats({
      maxDrawdown: maxDD,
      avgDrawdown: avgDD,
      currentDrawdown: drawdowns[drawdowns.length - 1],
      drawdownPeriods: periods.length,
      timeInDrawdown: timeInDrawdownPct,
      avgDuration,
      longestDuration: longestDD?.duration || 0,
      recoveryTime,
      top3Drawdowns: periods.slice(0, 3)
    });
  };

  const drawChart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const margin = { top: 30, right: 80, bottom: 50, left: 70 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const drawdowns = data.map(d => d.drawdown || 0);
    const maxDD = Math.max(...drawdowns, 1);
    const minTime = data[0].time;
    const maxTime = data[data.length - 1].time;

    // Color based on severity
    let lineColor, gradientStart;
    if (maxDD < 5) {
      lineColor = '#10b981';
      gradientStart = 'rgba(16, 185, 129, 0.4)';
    } else if (maxDD < 15) {
      lineColor = '#f59e0b';
      gradientStart = 'rgba(245, 158, 11, 0.4)';
    } else {
      lineColor = '#ef4444';
      gradientStart = 'rgba(239, 68, 68, 0.4)';
    }

    const xScale = (time) => margin.left + ((time - minTime) / (maxTime - minTime)) * chartWidth;
    const yScale = (dd) => margin.top + (dd / maxDD) * chartHeight;

    // Draw background grid
    ctx.strokeStyle = 'rgba(42, 46, 57, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    for (let i = 0; i <= 5; i++) {
      const y = margin.top + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw risk zones
    const zones = [
      { threshold: 5, color: 'rgba(16, 185, 129, 0.05)', label: 'Low Risk' },
      { threshold: 15, color: 'rgba(245, 158, 11, 0.05)', label: 'Medium Risk' },
      { threshold: 100, color: 'rgba(239, 68, 68, 0.05)', label: 'High Risk' }
    ];
    
    let lastY = margin.top;
    zones.forEach(zone => {
      if (maxDD > 0) {
        const zoneHeight = yScale(Math.min(zone.threshold, maxDD)) - lastY;
        if (zoneHeight > 0) {
          ctx.fillStyle = zone.color;
          ctx.fillRect(margin.left, lastY, chartWidth, zoneHeight);
          lastY += zoneHeight;
        }
      }
    });

    // Draw gradient area
    const gradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + chartHeight);
    gradient.addColorStop(0, gradientStart);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    data.forEach(point => {
      ctx.lineTo(xScale(point.time), yScale(point.drawdown || 0));
    });
    ctx.lineTo(xScale(data[data.length - 1].time), margin.top);
    ctx.closePath();
    ctx.fill();

    // Store chart data for interactions
    chartDataRef.current = { xScale, yScale, margin, data, minTime, maxTime, maxDD, chartWidth, chartHeight };

    // Draw drawdown line (no glow)
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    data.forEach((point, idx) => {
      const x = xScale(point.time);
      const y = yScale(point.drawdown || 0);
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw crosshair if hovering
    if (hoveredPoint !== null && hoveredPoint >= 0 && hoveredPoint < data.length) {
      const point = data[hoveredPoint];
      const hx = xScale(point.time);
      const hy = yScale(point.drawdown || 0);

      ctx.strokeStyle = 'rgba(156, 163, 175, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, margin.top);
      ctx.lineTo(hx, height - margin.bottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(margin.left, hy);
      ctx.lineTo(width - margin.right, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d1117';
      ctx.beginPath();
      ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mark max drawdown point
    const maxDDIndex = drawdowns.indexOf(maxDD);
    if (maxDDIndex >= 0) {
      const maxDDPoint = data[maxDDIndex];
      const maxX = xScale(maxDDPoint.time);
      const maxY = yScale(maxDD);
      
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(maxX, maxY, 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#0d1117';
      ctx.beginPath();
      ctx.arc(maxX, maxY, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Label
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Max: -${maxDD.toFixed(1)}%`, maxX, maxY + 18);
    }

    // Y-axis labels (inverted - drawdown goes down)
    ctx.fillStyle = '#9aa6c6';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const dd = (maxDD / 5) * i;
      const y = margin.top + (chartHeight / 5) * i;
      ctx.fillText(`-${dd.toFixed(1)}%`, margin.left - 10, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    for (let i = 0; i <= 6; i++) {
      const time = minTime + ((maxTime - minTime) / 6) * i;
      const x = margin.left + (chartWidth / 6) * i;
      const date = new Date(time);
      ctx.fillText(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), x, height - margin.bottom + 20);
    }

    // Current drawdown on right
    const currentDD = drawdowns[drawdowns.length - 1];
    const currentY = yScale(currentDD);
    ctx.textAlign = 'left';
    ctx.fillStyle = currentDD > 0 ? lineColor : '#10b981';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`-${currentDD.toFixed(1)}%`, width - margin.right + 8, currentY + 4);
  };

  const formatDuration = (bars) => {
    if (bars < 24) return `${bars} bars`;
    const days = Math.floor(bars / 24);
    return `${days}d`;
  };

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !chartDataRef.current.data) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const { margin, data, minTime, maxTime, chartWidth } = chartDataRef.current;

    if (x >= margin.left && x <= rect.width - margin.right) {
      const time = minTime + ((x - margin.left) / chartWidth) * (maxTime - minTime);
      let closestIdx = 0;
      let minDiff = Infinity;
      data.forEach((point, idx) => {
        const diff = Math.abs(point.time - time);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });
      setHoveredPoint(closestIdx);
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setHoveredPoint(null);
      setMousePos(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredPoint(null);
    setMousePos(null);
  }, []);

  return (
    <div className="drawdown-chart-enhanced">
      {stats && (
        <div className="dd-stats-bar">
          <div className="dd-stat main">
            <span className="dd-label">Max Drawdown</span>
            <span className="dd-value negative">-{stats.maxDrawdown?.toFixed(2)}%</span>
          </div>
          <div className="dd-stat">
            <span className="dd-label">Current DD</span>
            <span className={`dd-value ${stats.currentDrawdown > 0 ? 'negative' : 'positive'}`}>
              {stats.currentDrawdown > 0 ? `-${stats.currentDrawdown.toFixed(2)}%` : '0.00%'}
            </span>
          </div>
          <div className="dd-stat">
            <span className="dd-label">Avg Drawdown</span>
            <span className="dd-value neutral">-{stats.avgDrawdown?.toFixed(2)}%</span>
          </div>
          <div className="dd-stat">
            <span className="dd-label">Time in DD</span>
            <span className="dd-value neutral">{stats.timeInDrawdown?.toFixed(1)}%</span>
          </div>
          <div className="dd-stat">
            <span className="dd-label">DD Periods</span>
            <span className="dd-value">{stats.drawdownPeriods}</span>
          </div>
          <div className="dd-stat">
            <span className="dd-label">Avg Duration</span>
            <span className="dd-value">{formatDuration(Math.round(stats.avgDuration || 0))}</span>
          </div>
        </div>
      )}
      
      <div className="dd-chart-container" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        <canvas ref={canvasRef}></canvas>
        {hoveredPoint !== null && data && data[hoveredPoint] && mousePos && (
          <div 
            className="dd-tooltip" 
            style={{ 
              left: mousePos.x > 200 ? mousePos.x - 140 : mousePos.x + 10, 
              top: mousePos.y > 100 ? mousePos.y - 70 : mousePos.y + 10 
            }}
          >
            <div className="tooltip-date">
              {new Date(data[hoveredPoint].time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="tooltip-dd negative">
              -{(data[hoveredPoint].drawdown || 0).toFixed(2)}%
            </div>
            <div className="tooltip-equity">
              Equity: ${data[hoveredPoint].equity?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 'N/A'}
            </div>
          </div>
        )}
      </div>
      
      {stats && stats.top3Drawdowns && stats.top3Drawdowns.length > 0 && (
        <div className="dd-periods-section">
          <h5>Worst Drawdown Periods</h5>
          <div className="dd-periods-list">
            {stats.top3Drawdowns.map((period, idx) => (
              <div key={idx} className={`dd-period-item ${period.ongoing ? 'ongoing' : ''}`}>
                <div className="period-rank">#{idx + 1}</div>
                <div className="period-details">
                  <div className="period-main">
                    <span className="period-dd">-{period.peak.toFixed(2)}%</span>
                    <span className="period-duration">{formatDuration(period.duration)}</span>
                  </div>
                  <div className="period-dates">
                    {new Date(period.startTime).toLocaleDateString()} 
                    {period.ongoing ? ' → ongoing' : ` → ${new Date(period.endTime).toLocaleDateString()}`}
                  </div>
                </div>
                {period.ongoing && <span className="ongoing-badge">Active</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DrawdownChart;
