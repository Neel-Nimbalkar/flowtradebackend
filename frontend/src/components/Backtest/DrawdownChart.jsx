import React, { useEffect, useRef } from 'react';
import './DrawdownChart.css';

const DrawdownChart = ({ data }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!data || data.length === 0) return;
    drawChart();
  }, [data]);

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

    const maxDD = Math.max(...data.map(d => d.drawdown));
    const minTime = data[0].time;
    const maxTime = data[data.length - 1].time;

    const xScale = (time) => margin.left + ((time - minTime) / (maxTime - minTime)) * chartWidth;
    const yScale = (dd) => height - margin.bottom - (dd / maxDD) * chartHeight;

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

    // Draw drawdown area
    ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.beginPath();
    ctx.moveTo(xScale(data[0].time), height - margin.bottom);
    data.forEach(point => {
      ctx.lineTo(xScale(point.time), yScale(point.drawdown));
    });
    ctx.lineTo(xScale(data[data.length - 1].time), height - margin.bottom);
    ctx.closePath();
    ctx.fill();

    // Draw drawdown line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((point, idx) => {
      const x = xScale(point.time);
      const y = yScale(point.drawdown);
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#9aa6c6';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const dd = (maxDD / 5) * i;
      const y = height - margin.bottom - (chartHeight / 5) * i;
      ctx.fillText(`$${dd.toFixed(0)}`, margin.left - 10, y + 4);
    }

    // Title
    ctx.fillStyle = '#cfe8ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Drawdown Over Time', width / 2, margin.top / 2 + 5);
  };

  return (
    <div className="drawdown-chart">
      <canvas ref={canvasRef} width={800} height={400}></canvas>
    </div>
  );
};

export default DrawdownChart;
