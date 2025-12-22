import React, { useEffect, useRef, useState, useCallback } from 'react';
import './PriceChart.css';

const PriceChart = ({ historicalData, signals, trades }) => {
  const canvasRef = useRef(null);
  const equityDotsCanvasRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [showVolume, setShowVolume] = useState(true);
  const [showSignals, setShowSignals] = useState(true);
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const [mousePos, setMousePos] = useState(null);
  const chartDataRef = useRef({});

  useEffect(() => {
    if (!historicalData || historicalData.length === 0) return;
    calculateStats();
    drawChart();
    drawEquityDotsChart();
  }, [historicalData, signals, showVolume, showSignals, trades, hoveredCandle]);

  const calculateStats = () => {
    if (!historicalData || historicalData.length < 2) return;
    
    const prices = historicalData.map(d => ({
      open: parseFloat(d.o || d.open || 0),
      high: parseFloat(d.h || d.high || 0),
      low: parseFloat(d.l || d.low || 0),
      close: parseFloat(d.c || d.close || 0),
      volume: parseFloat(d.v || d.volume || 0)
    }));
    
    const startPrice = prices[0].close;
    const endPrice = prices[prices.length - 1].close;
    const highPrice = Math.max(...prices.map(p => p.high));
    const lowPrice = Math.min(...prices.map(p => p.low));
    const priceChange = endPrice - startPrice;
    const priceChangePct = (priceChange / startPrice) * 100;
    
    // Calculate volatility
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push(((prices[i].close - prices[i - 1].close) / prices[i - 1].close) * 100);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);
    
    // Average true range
    let atr = 0;
    for (let i = 1; i < prices.length; i++) {
      const tr = Math.max(
        prices[i].high - prices[i].low,
        Math.abs(prices[i].high - prices[i - 1].close),
        Math.abs(prices[i].low - prices[i - 1].close)
      );
      atr += tr;
    }
    atr = atr / (prices.length - 1);
    
    // Average volume
    const avgVolume = prices.reduce((sum, p) => sum + p.volume, 0) / prices.length;
    const totalVolume = prices.reduce((sum, p) => sum + p.volume, 0);
    
    // Bullish/Bearish candles
    const bullishCandles = prices.filter(p => p.close >= p.open).length;
    const bearishCandles = prices.length - bullishCandles;
    
    // Signal stats
    const buySignals = signals?.filter(s => (s.signal || s.action || '').toUpperCase() === 'BUY').length || 0;
    const sellSignals = signals?.filter(s => (s.signal || s.action || '').toUpperCase() === 'SELL').length || 0;
    
    setStats({
      startPrice,
      endPrice,
      highPrice,
      lowPrice,
      priceChange,
      priceChangePct,
      volatility,
      atr,
      avgVolume,
      totalVolume,
      bullishCandles,
      bearishCandles,
      totalCandles: prices.length,
      buySignals,
      sellSignals
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

    const volumeHeight = showVolume ? 60 : 0;
    const margin = { top: 20, right: 80, bottom: 40 + volumeHeight, left: 70 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Sample data if needed
    let sampledData = historicalData;
    let sampleRate = 1;
    if (historicalData.length > 400) {
      sampleRate = Math.ceil(historicalData.length / 400);
      sampledData = historicalData.filter((_, i) => i % sampleRate === 0);
    }

    const prices = sampledData.map(d => ({
      time: new Date(d.t || d.time || d.timestamp).getTime(),
      open: parseFloat(d.o || d.open || 0),
      high: parseFloat(d.h || d.high || 0),
      low: parseFloat(d.l || d.low || 0),
      close: parseFloat(d.c || d.close || 0),
      volume: parseFloat(d.v || d.volume || 0)
    }));

    const minPrice = Math.min(...prices.map(p => p.low)) * 0.999;
    const maxPrice = Math.max(...prices.map(p => p.high)) * 1.001;
    const maxVolume = Math.max(...prices.map(p => p.volume));

    const xScale = (idx) => margin.left + (idx / (sampledData.length - 1)) * chartWidth;
    const yScale = (price) => margin.top + ((maxPrice - price) / (maxPrice - minPrice)) * chartHeight;
    const volumeScale = (vol) => height - margin.bottom + volumeHeight - (vol / maxVolume) * volumeHeight;

    // Draw grid
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

    // Draw volume bars first (background)
    if (showVolume && volumeHeight > 0) {
      const barWidth = Math.max(1, chartWidth / sampledData.length * 0.7);
      prices.forEach((bar, idx) => {
        const x = xScale(idx);
        const volY = volumeScale(bar.volume);
        const volHeight = height - margin.bottom + volumeHeight - volY;
        const isUp = bar.close >= bar.open;
        
        ctx.fillStyle = isUp ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)';
        ctx.fillRect(x - barWidth / 2, volY, barWidth, volHeight);
      });
    }

    // Draw candlesticks
    const candleWidth = Math.max(1, Math.min(8, chartWidth / sampledData.length * 0.8));
    prices.forEach((bar, idx) => {
      const x = xScale(idx);
      const yHigh = yScale(bar.high);
      const yLow = yScale(bar.low);
      const yOpen = yScale(bar.open);
      const yClose = yScale(bar.close);

      const isUp = bar.close >= bar.open;
      const color = isUp ? '#3b82f6' : '#ef4444';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      const bodyHeight = Math.abs(yClose - yOpen);
      ctx.fillRect(x - candleWidth / 2, Math.min(yOpen, yClose), candleWidth, Math.max(1, bodyHeight));
    });

    // Draw signal markers (no glow)
    if (showSignals && signals && signals.length > 0) {
      signals.forEach(signal => {
        const signalType = (signal.signal || signal.action || '').toUpperCase();
        if (signalType !== 'BUY' && signalType !== 'SELL') return;

        const signalTime = new Date(signal.time || signal.timestamp || signal.t).getTime();
        const signalPrice = parseFloat(signal.price || signal.close || 0);

        // Find closest candle
        let closestIdx = 0;
        let minDiff = Infinity;
        prices.forEach((bar, idx) => {
          const diff = Math.abs(bar.time - signalTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = idx;
          }
        });

        const x = xScale(closestIdx);
        const y = yScale(signalPrice);
        const isBuy = signalType === 'BUY';

        // Draw marker without glow
        ctx.fillStyle = isBuy ? '#3b82f6' : '#ef4444';
        
        ctx.beginPath();
        if (isBuy) {
          // Up arrow
          ctx.moveTo(x, y - 12);
          ctx.lineTo(x - 6, y);
          ctx.lineTo(x + 6, y);
        } else {
          // Down arrow
          ctx.moveTo(x, y + 12);
          ctx.lineTo(x - 6, y);
          ctx.lineTo(x + 6, y);
        }
        ctx.closePath();
        ctx.fill();
      });
    }

    // Draw crosshair if hovering
    if (hoveredCandle !== null && hoveredCandle >= 0 && hoveredCandle < prices.length) {
      const bar = prices[hoveredCandle];
      const hx = xScale(hoveredCandle);

      ctx.strokeStyle = 'rgba(156, 163, 175, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hx, margin.top);
      ctx.lineTo(hx, height - margin.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Store for interactions
    chartDataRef.current = { xScale, yScale, margin, prices, chartWidth };

    // Y-axis labels
    ctx.fillStyle = '#9aa6c6';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const price = maxPrice - ((maxPrice - minPrice) / 5) * i;
      const y = margin.top + (chartHeight / 5) * i;
      ctx.fillText(`$${price.toFixed(2)}`, margin.left - 10, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const labelCount = Math.min(6, sampledData.length);
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((sampledData.length - 1) * (i / (labelCount - 1)));
      const x = xScale(idx);
      const date = new Date(prices[idx].time);
      ctx.fillText(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), x, height - (showVolume ? volumeHeight + 20 : 20));
    }

    // Current price on right
    const lastPrice = prices[prices.length - 1];
    const lastY = yScale(lastPrice.close);
    ctx.textAlign = 'left';
    ctx.fillStyle = lastPrice.close >= prices[0].close ? '#3b82f6' : '#ef4444';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`$${lastPrice.close.toFixed(2)}`, width - margin.right + 8, lastY + 4);
  };

  const formatVolume = (vol) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return vol.toFixed(0);
  };

  // TradingView-style equity dots chart
  const drawEquityDotsChart = () => {
    const canvas = equityDotsCanvasRef.current;
    if (!canvas || !trades || trades.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const margin = { top: 20, right: 60, bottom: 30, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    ctx.clearRect(0, 0, width, height);

    // Calculate cumulative P&L for each trade
    let cumulative = 0;
    const equityPoints = trades.map((trade, idx) => {
      cumulative += trade.netProfit || 0;
      return {
        x: idx,
        equity: cumulative,
        profit: trade.netProfit || 0,
        isWin: (trade.netProfit || 0) > 0
      };
    });

    const minEquity = Math.min(0, ...equityPoints.map(p => p.equity));
    const maxEquity = Math.max(...equityPoints.map(p => p.equity));
    const range = maxEquity - minEquity || 1;

    const xScale = (idx) => margin.left + (idx / (trades.length - 1 || 1)) * chartWidth;
    const yScale = (eq) => margin.top + chartHeight - ((eq - minEquity) / range) * chartHeight;

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
    const zeroY = yScale(0);
    if (zeroY >= margin.top && zeroY <= height - margin.bottom) {
      ctx.strokeStyle = 'rgba(156, 163, 175, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, zeroY);
      ctx.lineTo(width - margin.right, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw connecting line (thin)
    ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    equityPoints.forEach((point, idx) => {
      const x = xScale(point.x);
      const y = yScale(point.equity);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw dots (TradingView style - green for wins, red for losses)
    equityPoints.forEach((point, idx) => {
      const x = xScale(point.x);
      const y = yScale(point.equity);
      const dotSize = 5;

      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = point.isWin ? '#3b82f6' : '#ef5350';
      ctx.fill();
    });

    // Y-axis labels
    ctx.fillStyle = '#787b86';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const eq = minEquity + (range / 4) * (4 - i);
      const y = margin.top + (chartHeight / 4) * i;
      ctx.fillText(`$${eq.toFixed(0)}`, margin.left - 8, y + 3);
    }

    // X-axis - trade numbers
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(trades.length / 6));
    for (let i = 0; i < trades.length; i += step) {
      const x = xScale(i);
      ctx.fillText(`#${i + 1}`, x, height - 10);
    }

    // Current value label
    if (equityPoints.length > 0) {
      const last = equityPoints[equityPoints.length - 1];
      const lastY = yScale(last.equity);
      ctx.textAlign = 'left';
      ctx.fillStyle = last.equity >= 0 ? '#3b82f6' : '#ef5350';
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(`$${last.equity.toFixed(2)}`, width - margin.right + 8, lastY + 3);
    }
  };

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !chartDataRef.current.prices) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const { margin, prices, chartWidth } = chartDataRef.current;

    if (x >= margin.left && x <= rect.width - margin.right) {
      const idx = Math.round((x - margin.left) / chartWidth * (prices.length - 1));
      setHoveredCandle(Math.max(0, Math.min(prices.length - 1, idx)));
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setHoveredCandle(null);
      setMousePos(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredCandle(null);
    setMousePos(null);
  }, []);

  return (
    <div className="price-chart-enhanced">
      {stats && (
        <div className="price-stats-bar">
          <div className="price-stat main">
            <span className="price-label">Price Change</span>
            <span className={`price-value ${stats.priceChangePct >= 0 ? 'positive' : 'negative'}`}>
              {stats.priceChangePct >= 0 ? '+' : ''}{stats.priceChangePct?.toFixed(2)}%
            </span>
            <span className={`price-sub ${stats.priceChange >= 0 ? 'positive' : 'negative'}`}>
              {stats.priceChange >= 0 ? '+' : ''}${stats.priceChange?.toFixed(2)}
            </span>
          </div>
          <div className="price-stat">
            <span className="price-label">High</span>
            <span className="price-value positive">${stats.highPrice?.toFixed(2)}</span>
          </div>
          <div className="price-stat">
            <span className="price-label">Low</span>
            <span className="price-value negative">${stats.lowPrice?.toFixed(2)}</span>
          </div>
          <div className="price-stat">
            <span className="price-label">ATR</span>
            <span className="price-value">${stats.atr?.toFixed(2)}</span>
          </div>
          <div className="price-stat">
            <span className="price-label">Volatility</span>
            <span className="price-value neutral">{stats.volatility?.toFixed(2)}%</span>
          </div>
          <div className="price-stat">
            <span className="price-label">Avg Volume</span>
            <span className="price-value">{formatVolume(stats.avgVolume || 0)}</span>
          </div>
        </div>
      )}
      
      <div className="chart-controls">
        <label className="control-toggle">
          <input type="checkbox" checked={showVolume} onChange={e => setShowVolume(e.target.checked)} />
          <span>Volume</span>
        </label>
        <label className="control-toggle">
          <input type="checkbox" checked={showSignals} onChange={e => setShowSignals(e.target.checked)} />
          <span>Signals</span>
        </label>
      </div>
      
      <div className="price-chart-container" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        <canvas ref={canvasRef}></canvas>
        {hoveredCandle !== null && chartDataRef.current.prices && chartDataRef.current.prices[hoveredCandle] && mousePos && (
          <div 
            className="price-tooltip" 
            style={{ 
              left: mousePos.x > 300 ? mousePos.x - 160 : mousePos.x + 10, 
              top: 10 
            }}
          >
            <div className="tooltip-date">
              {new Date(chartDataRef.current.prices[hoveredCandle].time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="tooltip-ohlc">
              <span>O: <b>${chartDataRef.current.prices[hoveredCandle].open.toFixed(2)}</b></span>
              <span>H: <b className="positive">${chartDataRef.current.prices[hoveredCandle].high.toFixed(2)}</b></span>
              <span>L: <b className="negative">${chartDataRef.current.prices[hoveredCandle].low.toFixed(2)}</b></span>
              <span>C: <b>${chartDataRef.current.prices[hoveredCandle].close.toFixed(2)}</b></span>
            </div>
            <div className="tooltip-volume">
              Vol: {formatVolume(chartDataRef.current.prices[hoveredCandle].volume)}
            </div>
          </div>
        )}
      </div>

      {/* TradingView-style Equity Dots Chart */}
      {trades && trades.length > 0 && (
        <div className="equity-dots-section">
          <div className="section-header">
            <h4>Trade Equity Progress</h4>
            <div className="dots-legend">
              <span className="legend-dot win"></span>
              <span>Win</span>
              <span className="legend-dot loss"></span>
              <span>Loss</span>
            </div>
          </div>
          <div className="equity-dots-container">
            <canvas ref={equityDotsCanvasRef}></canvas>
          </div>
        </div>
      )}
      
      {stats && (
        <div className="price-summary-row">
          <div className="summary-item">
            <span className="summary-icon bullish">↑</span>
            <span className="summary-label">Bullish</span>
            <span className="summary-value">{stats.bullishCandles}</span>
          </div>
          <div className="summary-item">
            <span className="summary-icon bearish">↓</span>
            <span className="summary-label">Bearish</span>
            <span className="summary-value">{stats.bearishCandles}</span>
          </div>
          <div className="summary-item">
            <span className="summary-icon buy">▲</span>
            <span className="summary-label">Buy Signals</span>
            <span className="summary-value">{stats.buySignals}</span>
          </div>
          <div className="summary-item">
            <span className="summary-icon sell">▼</span>
            <span className="summary-label">Sell Signals</span>
            <span className="summary-value">{stats.sellSignals}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total Candles</span>
            <span className="summary-value">{stats.totalCandles}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceChart;
