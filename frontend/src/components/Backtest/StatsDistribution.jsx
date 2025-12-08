import React, { useRef, useEffect, useState, useCallback } from 'react';
import './StatsDistribution.css';

const StatsDistribution = ({ trades }) => {
  const profitCanvasRef = useRef(null);
  const durationCanvasRef = useRef(null);
  const scatterCanvasRef = useRef(null);
  const hourlyCanvasRef = useRef(null);
  const [hoveredProfitBar, setHoveredProfitBar] = useState(null);
  const [hoveredDurationBar, setHoveredDurationBar] = useState(null);
  const [hoveredScatterPoint, setHoveredScatterPoint] = useState(null);
  const [tooltipInfo, setTooltipInfo] = useState(null);
  
  const wins = trades.filter(t => t.netProfit > 0);
  const losses = trades.filter(t => t.netProfit <= 0);

  // Create profit distribution buckets
  const createBuckets = () => {
    if (trades.length === 0) return [];
    
    const profits = trades.map(t => t.netProfit);
    const min = Math.min(...profits);
    const max = Math.max(...profits);
    const bucketCount = 12;
    const bucketSize = (max - min) / bucketCount;

    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      min: min + i * bucketSize,
      max: min + (i + 1) * bucketSize,
      count: 0,
      trades: []
    }));

    trades.forEach(trade => {
      const bucketIdx = Math.min(Math.floor((trade.netProfit - min) / bucketSize), bucketCount - 1);
      buckets[bucketIdx].count++;
      buckets[bucketIdx].trades.push(trade);
    });

    return buckets;
  };

  // Create duration distribution buckets
  const createDurationBuckets = () => {
    if (trades.length === 0) return [];

    const durations = trades.map(t => t.holdingDuration || 0);
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const bucketCount = 10;
    const bucketSize = (max - min) / bucketCount || 1;

    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      min: min + i * bucketSize,
      max: min + (i + 1) * bucketSize,
      count: 0,
      label: formatDuration(min + i * bucketSize),
      trades: []
    }));

    trades.forEach(trade => {
      const duration = trade.holdingDuration || 0;
      const bucketIdx = Math.min(Math.floor((duration - min) / bucketSize), bucketCount - 1);
      buckets[bucketIdx].count++;
      buckets[bucketIdx].trades.push(trade);
    });

    return buckets;
  };

  const formatDuration = (ms) => {
    const hours = ms / (1000 * 60 * 60);
    if (hours < 1) return `${Math.round(ms / (1000 * 60))}m`;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  const formatCurrency = (val) => {
    if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(1)}k`;
    return `$${val.toFixed(0)}`;
  };

  const profitBuckets = createBuckets();
  const durationBuckets = createDurationBuckets();

  // Draw profit distribution chart
  const drawProfitChart = useCallback(() => {
    const canvas = profitCanvasRef.current;
    if (!canvas || profitBuckets.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    ctx.clearRect(0, 0, width, height);

    const maxCount = Math.max(...profitBuckets.map(b => b.count), 1);
    const barWidth = chartWidth / profitBuckets.length - 6;

    // Draw grid
    ctx.strokeStyle = 'rgba(42, 46, 57, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
    }

    // Draw zero line
    const zeroX = margin.left + ((-profitBuckets[0].min) / (profitBuckets[profitBuckets.length - 1].max - profitBuckets[0].min)) * chartWidth;
    if (zeroX > margin.left && zeroX < width - margin.right) {
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.5)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(zeroX, margin.top);
      ctx.lineTo(zeroX, height - margin.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw bars
    profitBuckets.forEach((bucket, idx) => {
      const x = margin.left + idx * (chartWidth / profitBuckets.length) + 3;
      const barHeight = (bucket.count / maxCount) * chartHeight;
      const y = margin.top + chartHeight - barHeight;
      
      const isPositive = bucket.min >= 0;
      const isHovered = hoveredProfitBar === idx;
      
      // Softer colors without glow
      ctx.fillStyle = isPositive 
        ? (isHovered ? '#34d399' : 'rgba(16, 185, 129, 0.8)') 
        : (isHovered ? '#f87171' : 'rgba(239, 68, 68, 0.8)');
      
      // Rounded top corners
      const radius = 4;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, y + barHeight);
      ctx.lineTo(x, y + barHeight);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.fill();

      // Count label
      if (bucket.count > 0 && barHeight > 15) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bucket.count, x + barWidth / 2, y + 14);
      }
    });

    // X-axis labels
    ctx.fillStyle = '#787b86';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    
    [0, Math.floor(profitBuckets.length / 2), profitBuckets.length - 1].forEach(idx => {
      const bucket = profitBuckets[idx];
      const x = margin.left + idx * (chartWidth / profitBuckets.length) + barWidth / 2;
      ctx.fillText(formatCurrency(bucket.min), x, height - 10);
    });

    // Y-axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('# Trades', 0, 0);
    ctx.restore();
  }, [profitBuckets, hoveredProfitBar]);

  // Draw duration distribution chart
  const drawDurationChart = useCallback(() => {
    const canvas = durationCanvasRef.current;
    if (!canvas || durationBuckets.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    ctx.clearRect(0, 0, width, height);

    const maxCount = Math.max(...durationBuckets.map(b => b.count), 1);
    const barWidth = chartWidth / durationBuckets.length - 6;

    // Draw grid
    ctx.strokeStyle = 'rgba(42, 46, 57, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
    }

    // Draw bars
    durationBuckets.forEach((bucket, idx) => {
      const x = margin.left + idx * (chartWidth / durationBuckets.length) + 3;
      const barHeight = (bucket.count / maxCount) * chartHeight;
      const y = margin.top + chartHeight - barHeight;
      
      const isHovered = hoveredDurationBar === idx;
      // Softer purple without glow
      ctx.fillStyle = isHovered ? '#a78bfa' : 'rgba(139, 92, 246, 0.8)';
      
      // Rounded top corners
      const radius = 4;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, y + barHeight);
      ctx.lineTo(x, y + barHeight);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.fill();

      // Count label
      if (bucket.count > 0 && barHeight > 15) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bucket.count, x + barWidth / 2, y + 14);
      }
    });

    // X-axis labels
    ctx.fillStyle = '#787b86';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    
    durationBuckets.forEach((bucket, idx) => {
      if (idx % 2 === 0) {
        const x = margin.left + idx * (chartWidth / durationBuckets.length) + barWidth / 2;
        ctx.fillText(bucket.label, x, height - 10);
      }
    });
  }, [durationBuckets, hoveredDurationBar]);

  // Draw MAE vs MFE scatter plot
  const drawScatterPlot = useCallback(() => {
    const canvas = scatterCanvasRef.current;
    if (!canvas || trades.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const margin = { top: 30, right: 30, bottom: 50, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    ctx.clearRect(0, 0, width, height);

    const maes = trades.map(t => t.mae || 0);
    const mfes = trades.map(t => t.mfe || 0);
    const maxMAE = Math.max(...maes, 1);
    const maxMFE = Math.max(...mfes, 1);

    // Draw grid
    ctx.strokeStyle = 'rgba(42, 46, 57, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (chartHeight / 4) * i;
      const x = margin.left + (chartWidth / 4) * i;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, height - margin.bottom);
      ctx.stroke();
    }

    // Draw diagonal line (MAE = MFE)
    ctx.strokeStyle = 'rgba(156, 163, 175, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, margin.top);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw points (no glow)
    trades.slice(0, 100).forEach((trade, idx) => {
      const mae = trade.mae || 0;
      const mfe = trade.mfe || 0;
      const x = margin.left + (mae / maxMAE) * chartWidth;
      const y = height - margin.bottom - (mfe / maxMFE) * chartHeight;
      
      const isWin = trade.netProfit > 0;
      const isHovered = hoveredScatterPoint === idx;
      
      ctx.beginPath();
      ctx.arc(x, y, isHovered ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = isWin 
        ? (isHovered ? '#34d399' : 'rgba(38, 166, 154, 0.8)') 
        : (isHovered ? '#f87171' : 'rgba(239, 83, 80, 0.8)');
      ctx.fill();
    });

    // Axis labels
    ctx.fillStyle = '#787b86';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MAE (Max Adverse Excursion)', width / 2, height - 10);
    
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('MFE (Max Favorable Excursion)', 0, 0);
    ctx.restore();
  }, [trades, hoveredScatterPoint]);

  // Draw hourly performance chart
  const drawHourlyChart = useCallback(() => {
    const canvas = hourlyCanvasRef.current;
    if (!canvas || trades.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const margin = { top: 20, right: 20, bottom: 35, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    ctx.clearRect(0, 0, width, height);

    // Group trades by hour
    const hourlyData = {};
    for (let h = 0; h < 24; h++) {
      hourlyData[h] = { trades: 0, profit: 0, wins: 0 };
    }
    
    trades.forEach(trade => {
      const entryTime = new Date(trade.entryTime || trade.time || Date.now());
      const hour = entryTime.getHours();
      hourlyData[hour].trades++;
      hourlyData[hour].profit += trade.netProfit || 0;
      if ((trade.netProfit || 0) > 0) hourlyData[hour].wins++;
    });

    const hours = Object.keys(hourlyData).map(Number);
    const maxProfit = Math.max(...hours.map(h => Math.abs(hourlyData[h].profit)), 1);
    const barWidth = chartWidth / 24 - 3;

    // Draw grid
    ctx.strokeStyle = 'rgba(42, 46, 57, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
    }

    // Draw zero line
    const zeroY = margin.top + chartHeight / 2;
    ctx.strokeStyle = 'rgba(156, 163, 175, 0.4)';
    ctx.beginPath();
    ctx.moveTo(margin.left, zeroY);
    ctx.lineTo(width - margin.right, zeroY);
    ctx.stroke();

    // Draw bars
    hours.forEach(hour => {
      const data = hourlyData[hour];
      if (data.trades === 0) return;

      const x = margin.left + hour * (chartWidth / 24) + 1.5;
      const normalizedProfit = data.profit / maxProfit;
      const barHeight = Math.abs(normalizedProfit) * (chartHeight / 2);
      const isPositive = data.profit >= 0;
      const y = isPositive ? zeroY - barHeight : zeroY;

      ctx.fillStyle = isPositive ? 'rgba(38, 166, 154, 0.8)' : 'rgba(239, 83, 80, 0.8)';
      
      const radius = 3;
      ctx.beginPath();
      if (isPositive) {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + barWidth - radius, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
        ctx.lineTo(x + barWidth, y + barHeight);
        ctx.lineTo(x, y + barHeight);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + barWidth, y);
        ctx.lineTo(x + barWidth, y + barHeight - radius);
        ctx.quadraticCurveTo(x + barWidth, y + barHeight, x + barWidth - radius, y + barHeight);
        ctx.lineTo(x + radius, y + barHeight);
        ctx.quadraticCurveTo(x, y + barHeight, x, y + barHeight - radius);
      }
      ctx.fill();
    });

    // X-axis labels (hours)
    ctx.fillStyle = '#787b86';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    [0, 6, 12, 18, 23].forEach(hour => {
      const x = margin.left + hour * (chartWidth / 24) + barWidth / 2;
      ctx.fillText(`${hour}:00`, x, height - 8);
    });
  }, [trades]);

  useEffect(() => {
    drawProfitChart();
    drawDurationChart();
    drawScatterPlot();
    drawHourlyChart();
    
    const handleResize = () => {
      drawProfitChart();
      drawDurationChart();
      drawScatterPlot();
      drawHourlyChart();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawProfitChart, drawDurationChart, drawScatterPlot, drawHourlyChart]);

  const winRate = (wins.length / trades.length * 100).toFixed(1);
  const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.netProfit, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.netProfit, 0) / losses.length) : 0;
  const expectancy = (wins.length / trades.length * avgWin) - (losses.length / trades.length * avgLoss);
  const profitFactor = avgLoss > 0 ? (wins.reduce((s, t) => s + t.netProfit, 0)) / Math.abs(losses.reduce((s, t) => s + t.netProfit, 0) || 1) : 0;
  const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.netProfit)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.netProfit)) : 0;

  return (
    <div className="stats-distribution-enhanced">
      {/* Summary Cards - Cleaner Design */}
      <div className="dist-summary-grid">
        <div className="summary-stat-card">
          <div className="stat-icon win">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value positive">{wins.length}</span>
            <span className="stat-label">Winners</span>
          </div>
          <div className="stat-detail">
            <span>Avg: ${avgWin.toFixed(2)}</span>
            <span>Best: ${largestWin.toFixed(2)}</span>
          </div>
        </div>

        <div className="summary-stat-card">
          <div className="stat-icon loss">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value negative">{losses.length}</span>
            <span className="stat-label">Losers</span>
          </div>
          <div className="stat-detail">
            <span>Avg: -${avgLoss.toFixed(2)}</span>
            <span>Worst: ${largestLoss.toFixed(2)}</span>
          </div>
        </div>

        <div className="summary-stat-card">
          <div className="stat-icon rate">
            <span>%</span>
          </div>
          <div className="stat-info">
            <span className={`stat-value ${parseFloat(winRate) >= 50 ? 'positive' : 'neutral'}`}>{winRate}%</span>
            <span className="stat-label">Win Rate</span>
          </div>
          <div className="win-rate-bar">
            <div className="bar-fill" style={{ width: `${winRate}%` }}></div>
          </div>
        </div>

        <div className="summary-stat-card">
          <div className="stat-icon expect">
            <span>E</span>
          </div>
          <div className="stat-info">
            <span className={`stat-value ${expectancy >= 0 ? 'positive' : 'negative'}`}>
              ${expectancy.toFixed(2)}
            </span>
            <span className="stat-label">Expectancy</span>
          </div>
          <div className="stat-detail">
            <span>PF: {profitFactor.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Charts Grid - 2x2 Layout */}
      <div className="dist-charts-grid">
        <div className="dist-chart-card">
          <div className="chart-header">
            <h4>P&L Distribution</h4>
            <span className="chart-badge">{trades.length} trades</span>
          </div>
          <div className="chart-canvas-wrapper">
            <canvas ref={profitCanvasRef}></canvas>
          </div>
        </div>

        <div className="dist-chart-card">
          <div className="chart-header">
            <h4>Hold Time Distribution</h4>
            <span className="chart-badge">Duration</span>
          </div>
          <div className="chart-canvas-wrapper">
            <canvas ref={durationCanvasRef}></canvas>
          </div>
        </div>

        <div className="dist-chart-card">
          <div className="chart-header">
            <h4>Hourly Performance</h4>
            <span className="chart-badge">By Hour</span>
          </div>
          <div className="chart-canvas-wrapper">
            <canvas ref={hourlyCanvasRef}></canvas>
          </div>
        </div>

        <div className="dist-chart-card">
          <div className="chart-header">
            <h4>MAE vs MFE</h4>
            <div className="scatter-legend-inline">
              <span className="legend-dot win"></span>
              <span>Win</span>
              <span className="legend-dot loss"></span>
              <span>Loss</span>
            </div>
          </div>
          <div className="chart-canvas-wrapper">
            <canvas ref={scatterCanvasRef}></canvas>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsDistribution;
