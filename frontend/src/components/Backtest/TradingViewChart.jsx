import React, { useEffect, useRef, memo, useState } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import './TradingViewChart.css';

/**
 * TradingView-style Chart with Buy/Sell Markers for FlowGrid Trading
 * Uses TradingView Lightweight Charts for full marker control
 */
const TradingViewChart = ({ 
  symbol = 'SPY', 
  timeframe = '15Min', 
  signals = [], 
  trades = [],
  historicalData = [],
  theme = 'dark' 
}) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);

  // Theme colors
  const colors = theme === 'dark' ? {
    background: '#0a0a0f',
    text: '#d1d4dc',
    grid: 'rgba(66, 66, 66, 0.3)',
    upColor: '#26a69a',
    downColor: '#ef5350',
    wickUp: '#26a69a',
    wickDown: '#ef5350',
    volumeUp: 'rgba(38, 166, 154, 0.5)',
    volumeDown: 'rgba(239, 83, 80, 0.5)',
    crosshair: '#758696',
  } : {
    background: '#ffffff',
    text: '#191919',
    grid: 'rgba(200, 200, 200, 0.3)',
    upColor: '#26a69a',
    downColor: '#ef5350',
    wickUp: '#26a69a',
    wickDown: '#ef5350',
    volumeUp: 'rgba(38, 166, 154, 0.5)',
    volumeDown: 'rgba(239, 83, 80, 0.5)',
    crosshair: '#9B9B9B',
  };

  // Convert historical data to chart format
  const formatCandleData = (data) => {
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    
    return data.map((bar, index) => {
      // Handle different timestamp formats
      let time;
      if (bar.timestamp) {
        time = Math.floor(new Date(bar.timestamp).getTime() / 1000);
      } else if (bar.time) {
        time = typeof bar.time === 'number' ? bar.time : Math.floor(new Date(bar.time).getTime() / 1000);
      } else if (bar.t) {
        time = typeof bar.t === 'number' ? bar.t : Math.floor(new Date(bar.t).getTime() / 1000);
      } else {
        // Use index as fallback
        time = Math.floor(Date.now() / 1000) - (data.length - index) * 60;
      }

      return {
        time,
        open: parseFloat(bar.open || bar.o || 0),
        high: parseFloat(bar.high || bar.h || 0),
        low: parseFloat(bar.low || bar.l || 0),
        close: parseFloat(bar.close || bar.c || 0),
        volume: parseFloat(bar.volume || bar.v || 0),
      };
    }).filter(bar => bar.open > 0 && bar.high > 0 && bar.low > 0 && bar.close > 0)
      .sort((a, b) => a.time - b.time);
  };

  // Create markers from signals and trades
  const createMarkers = (candleData) => {
    const markers = [];
    
    // Helper to find closest candle time
    const findClosestTime = (targetTime) => {
      if (!candleData || candleData.length === 0) return null;
      
      const targetTs = typeof targetTime === 'number' ? targetTime : Math.floor(new Date(targetTime).getTime() / 1000);
      
      let closest = candleData[0];
      let minDiff = Math.abs(candleData[0].time - targetTs);
      
      for (const candle of candleData) {
        const diff = Math.abs(candle.time - targetTs);
        if (diff < minDiff) {
          minDiff = diff;
          closest = candle;
        }
      }
      
      return closest.time;
    };

    // Add markers from trades (entry and exit points)
    if (trades && trades.length > 0) {
      trades.forEach((trade, index) => {
        // Entry marker
        if (trade.entry_time || trade.open_ts || trade.entryTime) {
          const entryTime = trade.entry_time || trade.open_ts || trade.entryTime;
          const closestTime = findClosestTime(entryTime);
          if (closestTime) {
            const isBuy = (trade.side === 'BUY' || trade.open_side === 'LONG' || trade.direction === 'long');
            markers.push({
              time: closestTime,
              position: isBuy ? 'belowBar' : 'aboveBar',
              color: isBuy ? '#00c853' : '#ff1744',
              shape: isBuy ? 'arrowUp' : 'arrowDown',
              text: isBuy ? 'BUY' : 'SELL',
              size: 2,
            });
          }
        }
        
        // Exit marker
        if (trade.exit_time || trade.close_ts || trade.exitTime) {
          const exitTime = trade.exit_time || trade.close_ts || trade.exitTime;
          const closestTime = findClosestTime(exitTime);
          if (closestTime) {
            const isExitBuy = (trade.exit_side === 'BUY' || trade.close_side === 'SHORT');
            markers.push({
              time: closestTime,
              position: isExitBuy ? 'belowBar' : 'aboveBar',
              color: isExitBuy ? '#00c853' : '#ff1744',
              shape: isExitBuy ? 'arrowUp' : 'arrowDown',
              text: `EXIT ${trade.net_pct ? (trade.net_pct > 0 ? '+' : '') + trade.net_pct.toFixed(2) + '%' : ''}`,
              size: 1,
            });
          }
        }
      });
    }

    // Add markers from signals (if no trades, use signals directly)
    if (signals && signals.length > 0 && markers.length === 0) {
      signals.forEach((signal, index) => {
        const signalTime = signal.timestamp || signal.time || signal.ts;
        if (signalTime) {
          const closestTime = findClosestTime(signalTime);
          if (closestTime) {
            const isBuy = signal.type === 'BUY' || signal.signal === 'BUY' || signal.direction === 'BUY';
            markers.push({
              time: closestTime,
              position: isBuy ? 'belowBar' : 'aboveBar',
              color: isBuy ? '#00c853' : '#ff1744',
              shape: isBuy ? 'arrowUp' : 'arrowDown',
              text: isBuy ? 'BUY' : 'SELL',
              size: 2,
            });
          }
        }
      });
    }

    // Sort markers by time and remove duplicates at same time
    const uniqueMarkers = [];
    const seenTimes = new Set();
    markers.sort((a, b) => a.time - b.time).forEach(marker => {
      const key = `${marker.time}-${marker.text}`;
      if (!seenTimes.has(key)) {
        seenTimes.add(key);
        uniqueMarkers.push(marker);
      }
    });

    return uniqueMarkers;
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Wait for container to have dimensions
    const container = chartContainerRef.current;
    const containerWidth = container.clientWidth || container.offsetWidth || 800;
    const containerHeight = container.clientHeight || container.offsetHeight || 500;

    // If container has no dimensions, wait for next frame
    if (containerWidth < 100 || containerHeight < 100) {
      const timer = setTimeout(() => {
        // Force re-render
        setIsLoading(prev => prev);
      }, 100);
      return () => clearTimeout(timer);
    }

    setIsLoading(true);
    setError(null);

    try {
      // Clean up existing chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      // Create chart with explicit dimensions
      const chart = createChart(container, {
        width: containerWidth,
        height: Math.max(containerHeight, 400),
        layout: {
          background: { type: ColorType.Solid, color: colors.background },
          textColor: colors.text,
        },
        grid: {
          vertLines: { color: colors.grid },
          horzLines: { color: colors.grid },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: colors.crosshair,
            width: 1,
            style: 2,
            labelBackgroundColor: '#2962ff',
          },
          horzLine: {
            color: colors.crosshair,
            width: 1,
            style: 2,
            labelBackgroundColor: '#2962ff',
          },
        },
        rightPriceScale: {
          borderColor: colors.grid,
          scaleMargins: {
            top: 0.1,
            bottom: 0.2,
          },
        },
        timeScale: {
          borderColor: colors.grid,
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: (time) => {
            const date = new Date(time * 1000);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          },
        },
        handleScroll: {
          vertTouchDrag: false,
        },
      });

      console.log('Chart created:', chart);
      console.log('Chart methods:', Object.keys(chart));
      console.log('addCandlestickSeries type:', typeof chart.addCandlestickSeries);

      chartRef.current = chart;

      // Create candlestick series (v4 API)
      let candleSeries;
      try {
        candleSeries = chart.addCandlestickSeries({
          upColor: colors.upColor,
          downColor: colors.downColor,
          wickUpColor: colors.wickUp,
          wickDownColor: colors.wickDown,
          borderVisible: false,
        });
        console.log('Candlestick series created:', candleSeries);
        console.log('setMarkers available:', typeof candleSeries.setMarkers);
      } catch (err) {
        console.error('Failed to create candlestick series:', err);
        throw err;
      }

      candleSeriesRef.current = candleSeries;

      // Create volume series (v4 API)
      const volumeSeries = chart.addHistogramSeries({
        color: colors.volumeUp,
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
        scaleMargins: {
          top: 0.85,
          bottom: 0,
        },
      });

      volumeSeriesRef.current = volumeSeries;

      // Format and set data
      const candleData = formatCandleData(historicalData);
      
      if (candleData.length > 0) {
        candleSeries.setData(candleData);

        // Set volume data with colors
        const volumeData = candleData.map(bar => ({
          time: bar.time,
          value: bar.volume,
          color: bar.close >= bar.open ? colors.volumeUp : colors.volumeDown,
        }));
        volumeSeries.setData(volumeData);

        // Create and set markers
        const markers = createMarkers(candleData);
        if (markers.length > 0) {
          candleSeries.setMarkers(markers);
        }

        // Fit content
        chart.timeScale().fitContent();
      } else {
        setError('No chart data available');
      }

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          const newWidth = chartContainerRef.current.clientWidth || chartContainerRef.current.offsetWidth;
          const newHeight = chartContainerRef.current.clientHeight || chartContainerRef.current.offsetHeight;
          if (newWidth > 100 && newHeight > 100) {
            chartRef.current.applyOptions({
              width: newWidth,
              height: Math.max(newHeight, 400),
            });
          }
        }
      };

      window.addEventListener('resize', handleResize);

      // Use ResizeObserver for container size changes
      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(container);

      // Trigger initial resize after a short delay
      setTimeout(() => {
        handleResize();
        chart.timeScale().fitContent();
      }, 50);

      // Subscribe to crosshair move for tooltip
      chart.subscribeCrosshairMove((param) => {
        if (param.time && param.seriesData && param.seriesData.size > 0) {
          const data = param.seriesData.get(candleSeries);
          if (data) {
            // Could update tooltip state here
          }
        }
      });

      setIsLoading(false);

      return () => {
        window.removeEventListener('resize', handleResize);
        resizeObserver.disconnect();
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
      };
    } catch (err) {
      console.error('Chart error:', err);
      setError(err.message || 'Failed to create chart');
      setIsLoading(false);
    }
  }, [historicalData, signals, trades, theme]);

  // Calculate signal stats
  const buyCount = (signals?.filter(s => s.type === 'BUY' || s.signal === 'BUY').length || 0) +
                   (trades?.filter(t => t.open_side === 'LONG' || t.side === 'BUY').length || 0);
  const sellCount = (signals?.filter(s => s.type === 'SELL' || s.signal === 'SELL').length || 0) +
                    (trades?.filter(t => t.open_side === 'SHORT' || t.side === 'SELL').length || 0);

  return (
    <div className="tradingview-chart-wrapper">
      <div className="tv-chart-header">
        <div className="tv-chart-info">
          <span className="tv-symbol">{symbol}</span>
          <span className="tv-timeframe">{timeframe}</span>
          <span className="tv-chart-type">Candlestick</span>
        </div>
        <div className="tv-signals-count">
          <span className="signal-badge buy">
            <span className="marker-icon">▲</span> {buyCount} Buys
          </span>
          <span className="signal-badge sell">
            <span className="marker-icon">▼</span> {sellCount} Sells
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="tv-loading">
          <div className="tv-spinner"></div>
          <span>Loading Chart...</span>
        </div>
      )}

      {error && (
        <div className="tv-error">
          <span>⚠️ {error}</span>
          <p className="tv-error-hint">
            Make sure historical data is available in the backtest results.
          </p>
        </div>
      )}

      <div 
        className="chart-container" 
        ref={chartContainerRef} 
        style={{ 
          flex: 1,
          width: '100%',
          minHeight: '400px',
          visibility: isLoading || error ? 'hidden' : 'visible',
          position: 'relative'
        }}
      />

      <div className="tv-signals-legend">
        <div className="legend-row">
          <div className="legend-item">
            <span className="legend-marker buy">▲</span>
            <span>Buy Entry</span>
          </div>
          <div className="legend-item">
            <span className="legend-marker sell">▼</span>
            <span>Sell Entry</span>
          </div>
          <div className="legend-item">
            <span className="legend-color up"></span>
            <span>Bullish Candle</span>
          </div>
          <div className="legend-item">
            <span className="legend-color down"></span>
            <span>Bearish Candle</span>
          </div>
        </div>
        <div className="legend-note">
          Scroll to zoom • Drag to pan • Click markers for details
        </div>
      </div>
    </div>
  );
};

export default memo(TradingViewChart);
