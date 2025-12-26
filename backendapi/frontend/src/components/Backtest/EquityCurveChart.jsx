import React, { useEffect, useRef, useState, useCallback } from 'react';
import './EquityCurveChart.css';

const EquityCurveChart = ({ data, trades }) => {
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [stats, setStats] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const chartDataRef = useRef({ xScale: null, yScale: null, margin: null, data: null });

  useEffect(() => {
    if (!data || data.length === 0) return;
    calculateStats();
    drawChart();
  }, [data, hoveredPoint]);

  const calculateStats = () => {
    if (!data || data.length < 2) return;
    
    const startEquity = data[0].equity;
    const endEquity = data[data.length - 1].equity;
    const returns = [];
    let peak = startEquity;
    let maxDrawdown = 0;
    let currentDrawdown = 0;
    
    // Calculate daily/bar returns
    for (let i = 1; i < data.length; i++) {
      const ret = ((data[i].equity - data[i - 1].equity) / data[i - 1].equity) * 100;
      returns.push(ret);
      
      if (data[i].equity > peak) {
        peak = data[i].equity;
      }
      currentDrawdown = ((peak - data[i].equity) / peak) * 100;
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
      }
    }
    
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
    
    // Calculate CAGR (annualized)
    const totalReturn = ((endEquity - startEquity) / startEquity) * 100;
    const periods = data.length;
    const periodsPerYear = 252; // Assume daily data
    const years = periods / periodsPerYear;
    const cagr = years > 0 ? (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100 : totalReturn;
    
    // Calculate volatility (annualized)
    const volatility = stdDev * Math.sqrt(252);
    
    // Calculate Sortino (only downside deviation)
    const negReturns = returns.filter(r => r < 0);
    const downsideVar = negReturns.length > 0 
      ? negReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negReturns.length 
      : 0;
    const downsideDev = Math.sqrt(downsideVar);
    const sortino = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : 0;
    
    setStats({
      totalReturn,
      cagr,
      maxDrawdown,
      sharpe,
      sortino,
      volatility,
      peak,
      startEquity,
      endEquity
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

    const minEquity = Math.min(...data.map(d => d.equity)) * 0.995;
    const maxEquity = Math.max(...data.map(d => d.equity)) * 1.005;
    const minTime = data[0].time;
    const maxTime = data[data.length - 1].time;

    const startEquity = data[0].equity;
    const endEquity = data[data.length - 1].equity;
    const isProfit = endEquity >= startEquity;
    const lineColor = isProfit ? '#3b82f6' : '#ef4444';
    const gradientStart = isProfit ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    const gradientEnd = isProfit ? 'rgba(59, 130, 246, 0.02)' : 'rgba(239, 68, 68, 0.02)';

    const xScale = (time) => margin.left + ((time - minTime) / (maxTime - minTime)) * chartWidth;
    const yScale = (equity) => height - margin.bottom - ((equity - minEquity) / (maxEquity - minEquity)) * chartHeight;

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
    
    for (let i = 0; i <= 6; i++) {
      const x = margin.left + (chartWidth / 6) * i;
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, height - margin.bottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw starting equity line (benchmark)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    const startY = yScale(startEquity);
    ctx.moveTo(margin.left, startY);
    ctx.lineTo(width - margin.right, startY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw gradient area under curve
    const gradient = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom);
    gradient.addColorStop(0, gradientStart);
    gradient.addColorStop(1, gradientEnd);
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(xScale(data[0].time), height - margin.bottom);
    data.forEach(point => {
      ctx.lineTo(xScale(point.time), yScale(point.equity));
    });
    ctx.lineTo(xScale(data[data.length - 1].time), height - margin.bottom);
    ctx.closePath();
    ctx.fill();

    // Store chart data for mouse interactions
    chartDataRef.current = { xScale, yScale, margin, data, minTime, maxTime, minEquity, maxEquity, chartWidth, chartHeight };

    // Draw equity curve (no glow)
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    data.forEach((point, idx) => {
      const x = xScale(point.time);
      const y = yScale(point.equity);
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
      const hy = yScale(point.equity);

      // Vertical line
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, margin.top);
      ctx.lineTo(hx, height - margin.bottom);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(margin.left, hy);
      ctx.lineTo(width - margin.right, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Highlight point
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d1117';
      ctx.beginPath();
      ctx.arc(hx, hy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw peak equity marker
    const peakPoint = data.reduce((max, p) => p.equity > max.equity ? p : max, data[0]);
    const peakX = xScale(peakPoint.time);
    const peakY = yScale(peakPoint.equity);
    
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(peakX, peakY, 5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#3b82f6';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Peak', peakX, peakY - 10);

    // Draw end point marker
    const endX = xScale(data[data.length - 1].time);
    const endY = yScale(endEquity);
    
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(endX, endY, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#0d1117';
    ctx.beginPath();
    ctx.arc(endX, endY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Y-axis labels
    ctx.fillStyle = '#9aa6c6';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const equity = minEquity + ((maxEquity - minEquity) / 5) * i;
      const y = height - margin.bottom - (chartHeight / 5) * i;
      ctx.fillText(`$${equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, margin.left - 10, y + 4);
    }

    // X-axis labels (time)
    ctx.textAlign = 'center';
    for (let i = 0; i <= 6; i++) {
      const time = minTime + ((maxTime - minTime) / 6) * i;
      const x = margin.left + (chartWidth / 6) * i;
      const date = new Date(time);
      ctx.fillText(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), x, height - margin.bottom + 20);
    }

    // Current value label on right
    ctx.textAlign = 'left';
    ctx.fillStyle = lineColor;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`$${endEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, width - margin.right + 8, endY + 4);
  };

  const formatPercent = (val) => `${val >= 0 ? '+' : ''}${val?.toFixed(2)}%`;
  const formatCurrency = (val) => `$${val?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !chartDataRef.current.data) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
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
    <div className="equity-curve-enhanced">
      {stats && (
        <div className="equity-stats-bar">
          <div className="eq-stat">
            <span className="eq-label">Total Return</span>
            <span className={`eq-value ${stats.totalReturn >= 0 ? 'positive' : 'negative'}`}>
              {formatPercent(stats.totalReturn)}
            </span>
          </div>
          <div className="eq-stat">
            <span className="eq-label">CAGR</span>
            <span className={`eq-value ${stats.cagr >= 0 ? 'positive' : 'negative'}`}>
              {formatPercent(stats.cagr)}
            </span>
          </div>
          <div className="eq-stat">
            <span className="eq-label">Max Drawdown</span>
            <span className="eq-value negative">-{stats.maxDrawdown?.toFixed(2)}%</span>
          </div>
          <div className="eq-stat">
            <span className="eq-label">Sharpe</span>
            <span className={`eq-value ${stats.sharpe >= 1 ? 'positive' : 'neutral'}`}>
              {stats.sharpe?.toFixed(2)}
            </span>
          </div>
          <div className="eq-stat">
            <span className="eq-label">Sortino</span>
            <span className={`eq-value ${stats.sortino >= 1 ? 'positive' : 'neutral'}`}>
              {stats.sortino?.toFixed(2)}
            </span>
          </div>
          <div className="eq-stat">
            <span className="eq-label">Volatility</span>
            <span className="eq-value neutral">{stats.volatility?.toFixed(2)}%</span>
          </div>
        </div>
      )}
      
      <div className="equity-chart-container" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        <canvas ref={canvasRef}></canvas>
        {hoveredPoint !== null && data && data[hoveredPoint] && mousePos && (
          <div 
            className="chart-tooltip" 
            style={{ 
              left: mousePos.x > 200 ? mousePos.x - 150 : mousePos.x + 10, 
              top: mousePos.y > 100 ? mousePos.y - 80 : mousePos.y + 10 
            }}
          >
            <div className="tooltip-date">
              {new Date(data[hoveredPoint].time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className={`tooltip-value ${data[hoveredPoint].equity >= stats?.startEquity ? 'positive' : 'negative'}`}>
              ${data[hoveredPoint].equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className="tooltip-change">
              {((data[hoveredPoint].equity - stats?.startEquity) / stats?.startEquity * 100).toFixed(2)}% from start
            </div>
          </div>
        )}
      </div>
      
      {stats && (
        <div className="equity-summary-row">
          <div className="equity-start">
            <span className="label">Start</span>
            <span className="value">{formatCurrency(stats.startEquity)}</span>
          </div>
          <div className="equity-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
          <div className="equity-end">
            <span className="label">End</span>
            <span className={`value ${stats.endEquity >= stats.startEquity ? 'positive' : 'negative'}`}>
              {formatCurrency(stats.endEquity)}
            </span>
          </div>
          <div className="equity-peak">
            <span className="label">Peak</span>
            <span className="value positive">{formatCurrency(stats.peak)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EquityCurveChart;
