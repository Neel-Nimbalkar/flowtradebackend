import React, { useEffect, useRef } from 'react';
import './PriceChart.css';

const PriceChart = ({ historicalData, signals }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!historicalData || historicalData.length === 0) return;
    drawChart();
  }, [historicalData, signals]);

  const drawChart = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const margin = { top: 20, right: 40, bottom: 40, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Sample data if too many candles
    let sampledData = historicalData;
    if (historicalData.length > 500) {
      const step = Math.ceil(historicalData.length / 500);
      sampledData = historicalData.filter((_, i) => i % step === 0);
    }

    const prices = sampledData.map(d => [
      parseFloat(d.h || d.high || 0),
      parseFloat(d.l || d.low || 0)
    ]).flat();
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    const xScale = (idx) => margin.left + (idx / (sampledData.length - 1)) * chartWidth;
    const yScale = (price) => height - margin.bottom - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight;

    // Draw grid
    ctx.strokeStyle = '#2a2e39';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = margin.top + (chartHeight / 5) * i;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#9aa6c6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.stroke();

    // Draw candlesticks
    const candleWidth = Math.max(1, chartWidth / sampledData.length * 0.8);
    sampledData.forEach((bar, idx) => {
      const open = parseFloat(bar.o || bar.open || 0);
      const high = parseFloat(bar.h || bar.high || 0);
      const low = parseFloat(bar.l || bar.low || 0);
      const close = parseFloat(bar.c || bar.close || 0);

      const x = xScale(idx);
      const yHigh = yScale(high);
      const yLow = yScale(low);
      const yOpen = yScale(open);
      const yClose = yScale(close);

      const isUp = close >= open;
      ctx.strokeStyle = isUp ? '#10b981' : '#ef4444';
      ctx.fillStyle = isUp ? '#10b981' : '#ef4444';

      // Wick
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body
      const bodyHeight = Math.abs(yClose - yOpen);
      ctx.fillRect(x - candleWidth / 2, Math.min(yOpen, yClose), candleWidth, Math.max(1, bodyHeight));
    });

    // Draw signal markers
    if (signals && signals.length > 0) {
      signals.forEach(signal => {
        const signalType = (signal.signal || signal.action || '').toUpperCase();
        if (signalType !== 'BUY' && signalType !== 'SELL') return;

        const signalTime = new Date(signal.time || signal.timestamp || signal.t).getTime();
        const signalPrice = parseFloat(signal.price || signal.close || 0);

        // Find closest candle
        let closestIdx = 0;
        let minDiff = Infinity;
        sampledData.forEach((bar, idx) => {
          const barTime = new Date(bar.t || bar.time || bar.timestamp).getTime();
          const diff = Math.abs(barTime - signalTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = idx;
          }
        });

        const x = xScale(closestIdx);
        const y = yScale(signalPrice);

        // Draw triangle marker
        ctx.fillStyle = signalType === 'BUY' ? '#10b981' : '#ef4444';
        ctx.beginPath();
        if (signalType === 'BUY') {
          // Up triangle
          ctx.moveTo(x, y - 8);
          ctx.lineTo(x - 6, y + 2);
          ctx.lineTo(x + 6, y + 2);
        } else {
          // Down triangle
          ctx.moveTo(x, y + 8);
          ctx.lineTo(x - 6, y - 2);
          ctx.lineTo(x + 6, y - 2);
        }
        ctx.closePath();
        ctx.fill();
      });
    }

    // Y-axis labels
    ctx.fillStyle = '#9aa6c6';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const price = minPrice + ((maxPrice - minPrice) / 5) * i;
      const y = height - margin.bottom - (chartHeight / 5) * i;
      ctx.fillText(`$${price.toFixed(2)}`, margin.left - 10, y + 4);
    }

    // Title
    ctx.fillStyle = '#cfe8ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Price Action with Signals', width / 2, margin.top / 2 + 5);
  };

  return (
    <div className="price-chart">
      <canvas ref={canvasRef} width={800} height={400}></canvas>
      <div className="chart-legend">
        <span className="legend-item"><span className="legend-marker buy">▲</span> BUY Signal</span>
        <span className="legend-item"><span className="legend-marker sell">▼</span> SELL Signal</span>
      </div>
    </div>
  );
};

export default PriceChart;
