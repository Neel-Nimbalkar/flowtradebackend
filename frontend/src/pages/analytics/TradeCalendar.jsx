/**
 * Trade Calendar Tab - FlowGrid Trading
 * Calendar heatmap view showing daily P&L with month navigation
 * Reads from backend API with localStorage fallback
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import TradeDetailModal from './TradeDetailModal';
import { getTradesAsBackendFormat, fetchTradesFromBackend } from '../../services/tradeService';

// =============================================================================
// Utility Functions
// =============================================================================

const formatPercent = (value, showSign = true) => {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatDate = (date) => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getMonthName = (month) => {
  return ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'][month];
};

const getDaysInMonth = (year, month) => {
  return new Date(year, month + 1, 0).getDate();
};

const getFirstDayOfMonth = (year, month) => {
  // Returns 0 (Sunday) to 6 (Saturday), we want Monday = 0
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Convert to Monday-first
};

const isSameDay = (d1, d2) => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

const isToday = (date) => isSameDay(date, new Date());

const isFuture = (date) => date > new Date();

// =============================================================================
// Calendar Controls Component
// =============================================================================

const CalendarControls = ({ 
  year, 
  month, 
  onPrevMonth, 
  onNextMonth,
  strategies,
  selectedStrategy,
  onStrategyChange
}) => {
  const handleToday = () => {
    const now = new Date();
    // Navigate to current month via multiple prev/next calls would be complex,
    // so we'll emit a special event
    const diff = (now.getFullYear() - year) * 12 + (now.getMonth() - month);
    for (let i = 0; i < Math.abs(diff); i++) {
      if (diff > 0) onNextMonth();
      else onPrevMonth();
    }
  };
  
  return (
    <div className="calendar-controls">
      <div className="calendar-nav">
        <button className="nav-btn" onClick={onPrevMonth}>←</button>
        <span className="current-month">{getMonthName(month)} {year}</span>
        <button className="nav-btn" onClick={onNextMonth}>→</button>
        <button className="today-btn" onClick={handleToday}>Today</button>
      </div>
      
      <div className="calendar-filters">
        <select 
          value={selectedStrategy}
          onChange={(e) => onStrategyChange(e.target.value)}
        >
          <option value="ALL">All Strategies</option>
          {Object.entries(strategies).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

// =============================================================================
// Day Cell Component
// =============================================================================

const DayCell = ({ date, dayData, maxAbsPct, onClick, isCurrentMonth }) => {
  const [showPopover, setShowPopover] = useState(false);
  
  if (!date) {
    return <div className="calendar-day empty" />;
  }
  
  const dayNum = date.getDate();
  const hasTrades = dayData && dayData.trades > 0;
  const netPct = dayData?.netPct || 0;
  const today = isToday(date);
  const future = isFuture(date);
  
  // Calculate heatmap intensity
  const intensity = hasTrades && maxAbsPct > 0 
    ? Math.min(Math.abs(netPct) / maxAbsPct, 1) * 0.8 + 0.2
    : 0;
  
  // Determine background color
  let bgColor = 'transparent';
  if (hasTrades) {
    if (netPct > 0) {
      bgColor = `rgba(34, 197, 94, ${intensity})`; // green
    } else if (netPct < 0) {
      bgColor = `rgba(239, 68, 68, ${intensity})`; // red
    } else {
      bgColor = 'rgba(156, 163, 175, 0.3)'; // gray for breakeven
    }
  }
  
  const cellClass = [
    'calendar-day',
    hasTrades ? 'has-trades' : '',
    today ? 'today' : '',
    future ? 'future' : '',
    !isCurrentMonth ? 'other-month' : ''
  ].filter(Boolean).join(' ');
  
  return (
    <div 
      className={cellClass}
      style={{ backgroundColor: bgColor }}
      onClick={() => hasTrades && onClick(date, dayData)}
      onMouseEnter={() => hasTrades && setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      <span className="day-number">{dayNum}</span>
      {hasTrades && (
        <>
          <span className="trade-count">{dayData.trades} trade{dayData.trades > 1 ? 's' : ''}</span>
          <span className={`day-pnl ${netPct > 0 ? 'positive' : netPct < 0 ? 'negative' : ''}`}>
            {formatPercent(netPct)}
          </span>
        </>
      )}
      
      {/* Popover on hover */}
      {showPopover && hasTrades && (
        <div className="day-popover">
          <div className="popover-header">
            <span>{formatDate(date)}</span>
            <span className={netPct > 0 ? 'positive' : 'negative'}>{formatPercent(netPct)}</span>
          </div>
          <div className="popover-stats">
            <div className="popover-stat">
              <span className="label">Trades:</span>
              <span className="value">{dayData.trades}</span>
            </div>
            <div className="popover-stat">
              <span className="label">Wins:</span>
              <span className="value positive">{dayData.wins}</span>
            </div>
            <div className="popover-stat">
              <span className="label">Losses:</span>
              <span className="value negative">{dayData.losses}</span>
            </div>
          </div>
          <div className="popover-hint">Click to view trades</div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Calendar Grid Component
// =============================================================================

const CalendarGrid = ({ year, month, dailyData, onDayClick }) => {
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  // Calculate max absolute pct for heatmap scaling
  const maxAbsPct = useMemo(() => {
    const values = Object.values(dailyData).map(d => Math.abs(d.netPct || 0));
    return values.length > 0 ? Math.max(...values) : 1;
  }, [dailyData]);
  
  // Generate calendar days
  const calendarDays = useMemo(() => {
    const days = [];
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDay; i++) {
      days.push({ date: null, key: `empty-${i}` });
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = date.toISOString().split('T')[0];
      days.push({
        date,
        key: dateKey,
        data: dailyData[dateKey] || null
      });
    }
    
    return days;
  }, [year, month, dailyData]);
  
  return (
    <div className="calendar-grid">
      {/* Weekday headers */}
      <div className="calendar-weekdays">
        {weekdays.map(day => (
          <div key={day} className="weekday-header">{day}</div>
        ))}
      </div>
      
      {/* Calendar days */}
      <div className="calendar-days">
        {calendarDays.map(({ date, key, data }) => (
          <DayCell
            key={key}
            date={date}
            dayData={data}
            maxAbsPct={maxAbsPct}
            onClick={onDayClick}
            isCurrentMonth={true}
          />
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// Month Summary Component
// =============================================================================

const MonthSummary = ({ dailyData, trades }) => {
  const summary = useMemo(() => {
    const days = Object.values(dailyData);
    const activeDays = days.filter(d => d.trades > 0);
    
    if (activeDays.length === 0) {
      return {
        totalTrades: 0,
        tradingDays: 0,
        bestDayPct: 0,
        worstDayPct: 0,
        avgDailyPct: 0,
        monthlyNetPct: 0
      };
    }
    
    const netPcts = activeDays.map(d => d.netPct || 0);
    const totalTrades = activeDays.reduce((sum, d) => sum + d.trades, 0);
    const monthlyNetPct = netPcts.reduce((sum, p) => sum + p, 0);
    
    return {
      totalTrades,
      tradingDays: activeDays.length,
      bestDayPct: Math.max(...netPcts),
      worstDayPct: Math.min(...netPcts),
      avgDailyPct: monthlyNetPct / activeDays.length,
      monthlyNetPct
    };
  }, [dailyData]);
  
  return (
    <div className="month-summary">
      <div className="summary-stat">
        <span className="stat-label">Total Trades</span>
        <span className="stat-value">{summary.totalTrades}</span>
      </div>
      <div className="summary-stat">
        <span className="stat-label">Trading Days</span>
        <span className="stat-value">{summary.tradingDays}</span>
      </div>
      <div className="summary-stat">
        <span className="stat-label">Best Day</span>
        <span className="stat-value positive">{formatPercent(summary.bestDayPct)}</span>
      </div>
      <div className="summary-stat">
        <span className="stat-label">Worst Day</span>
        <span className="stat-value negative">{formatPercent(summary.worstDayPct)}</span>
      </div>
      <div className="summary-stat">
        <span className="stat-label">Avg Daily</span>
        <span className={`stat-value ${summary.avgDailyPct > 0 ? 'positive' : summary.avgDailyPct < 0 ? 'negative' : ''}`}>
          {formatPercent(summary.avgDailyPct)}
        </span>
      </div>
      <div className="summary-stat highlight">
        <span className="stat-label">Monthly Net</span>
        <span className={`stat-value ${summary.monthlyNetPct > 0 ? 'positive' : summary.monthlyNetPct < 0 ? 'negative' : ''}`}>
          {formatPercent(summary.monthlyNetPct)}
        </span>
      </div>
    </div>
  );
};

// =============================================================================
// Day Detail Modal Component
// =============================================================================

const DayDetailModal = ({ date, dayData, trades, strategies, onClose, onSelectTrade }) => {
  if (!date || !dayData) return null;
  
  const dateStr = date.toISOString().split('T')[0];
  const dayTrades = trades.filter(t => {
    if (!t.close_ts) return false;
    return t.close_ts.startsWith(dateStr);
  });
  
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };
  
  return (
    <div className="trade-modal-overlay" onClick={handleBackdropClick}>
      <div className="trade-modal day-detail-modal">
        <div className="modal-header">
          <div className="modal-title">
            <span className="date-title">{formatDate(date)}</span>
            <span className={`day-result ${dayData.netPct > 0 ? 'positive' : 'negative'}`}>
              {formatPercent(dayData.netPct)}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {/* Day summary */}
          <div className="day-modal-summary">
            <div className="day-stat">
              <span className="label">Trades</span>
              <span className="value">{dayData.trades}</span>
            </div>
            <div className="day-stat">
              <span className="label">Wins</span>
              <span className="value positive">{dayData.wins}</span>
            </div>
            <div className="day-stat">
              <span className="label">Losses</span>
              <span className="value negative">{dayData.losses}</span>
            </div>
            <div className="day-stat">
              <span className="label">Win Rate</span>
              <span className="value">
                {dayData.trades > 0 ? ((dayData.wins / dayData.trades) * 100).toFixed(0) : 0}%
              </span>
            </div>
          </div>
          
          {/* Trades list */}
          <div className="day-trades-list">
            <h4>Trades</h4>
            {dayTrades.length === 0 ? (
              <div className="no-trades">No trade details available</div>
            ) : (
              <div className="trades-list">
                {dayTrades.map(trade => (
                  <div 
                    key={trade.id} 
                    className={`trade-row ${(trade.net_pct || 0) > 0 ? 'win' : 'loss'}`}
                    onClick={() => onSelectTrade(trade)}
                  >
                    <span className="trade-time">
                      {new Date(trade.close_ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="trade-strategy">
                      {strategies[trade.strategy_id] || trade.strategy_id}
                    </span>
                    <span className={`side-badge ${(trade.open_side || '').toLowerCase()}`}>
                      {trade.open_side}
                    </span>
                    <span className={`trade-pnl ${(trade.net_pct || 0) > 0 ? 'positive' : 'negative'}`}>
                      {formatPercent(trade.net_pct)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="modal-close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Main Trade Calendar Component
// =============================================================================

const TradeCalendar = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [trades, setTrades] = useState([]);
  const [strategies, setStrategies] = useState({});
  const [selectedStrategy, setSelectedStrategy] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal state
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [selectedTrade, setSelectedTrade] = useState(null);
  
  // Fetch trades from backend with localStorage fallback
  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try backend first
      const backendTrades = await fetchTradesFromBackend({ limit: 1000 });
      
      if (backendTrades && backendTrades.length > 0) {
        // Transform backend format
        const formattedTrades = backendTrades.map(t => ({
          id: t.id,
          strategy_id: t.strategy_id,
          open_side: t.open_side,
          open_price: t.open_price,
          open_ts: t.open_ts,
          close_side: t.close_side,
          close_price: t.close_price,
          close_ts: t.close_ts,
          gross_pct: t.gross_pct,
          fee_pct_total: t.fee_pct_total,
          net_pct: t.net_pct,
          meta: t.meta
        }));
        setTrades(formattedTrades);
        console.log(`[TradeCalendar] Loaded ${formattedTrades.length} trades from backend`);
      } else {
        // Fallback to localStorage
        const data = getTradesAsBackendFormat();
        setTrades(data.trades || []);
        console.log(`[TradeCalendar] Loaded ${data.trades?.length || 0} trades from localStorage`);
      }
    } catch (err) {
      console.error('Error loading trades:', err);
      // Fallback to localStorage
      const data = getTradesAsBackendFormat();
      setTrades(data.trades || []);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Fetch strategies from localStorage
  const fetchStrategies = useCallback(async () => {
    try {
      const raw = localStorage.getItem('flowgrid_workflow_v1::saves');
      if (raw) {
        const saved = JSON.parse(raw);
        const stratMap = {};
        Object.keys(saved).forEach(k => { stratMap[k] = k; });
        setStrategies(stratMap);
      }
    } catch (err) {
      console.error('Error loading strategies:', err);
    }
  }, []);
  
  // Initial fetch
  useEffect(() => {
    fetchTrades();
    fetchStrategies();
  }, [fetchTrades, fetchStrategies]);
  
  // Listen for new trades
  useEffect(() => {
    const handleTradeCompleted = () => fetchTrades();
    window.addEventListener('flowgrid:trade-completed', handleTradeCompleted);
    return () => window.removeEventListener('flowgrid:trade-completed', handleTradeCompleted);
  }, [fetchTrades]);
  
  // Filter trades by strategy
  const filteredTrades = useMemo(() => {
    if (selectedStrategy === 'ALL') return trades;
    return trades.filter(t => t.strategy_id === selectedStrategy);
  }, [trades, selectedStrategy]);
  
  // Aggregate trades by day
  const dailyData = useMemo(() => {
    const data = {};
    
    filteredTrades.forEach(trade => {
      if (!trade.close_ts) return;
      
      const dateKey = trade.close_ts.split('T')[0];
      if (!data[dateKey]) {
        data[dateKey] = {
          trades: 0,
          wins: 0,
          losses: 0,
          netPct: 0
        };
      }
      
      data[dateKey].trades++;
      data[dateKey].netPct += trade.net_pct || 0;
      
      if ((trade.net_pct || 0) > 0) {
        data[dateKey].wins++;
      } else {
        data[dateKey].losses++;
      }
    });
    
    return data;
  }, [filteredTrades]);
  
  // Navigation handlers
  const handlePrevMonth = () => {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  };
  
  const handleNextMonth = () => {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  };
  
  const handleDayClick = (date, dayData) => {
    setSelectedDay(date);
    setSelectedDayData(dayData);
  };
  
  if (loading) {
    return (
      <div className="trade-calendar-loading">
        <div className="loading-spinner" />
        <div>Loading calendar...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="trade-calendar-error">
        <div className="error-icon">⚠️</div>
        <div>{error}</div>
        <button onClick={fetchTrades}>Retry</button>
      </div>
    );
  }
  
  return (
    <div className="trade-calendar">
      {/* Controls */}
      <CalendarControls
        year={year}
        month={month}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        strategies={strategies}
        selectedStrategy={selectedStrategy}
        onStrategyChange={setSelectedStrategy}
      />
      
      {/* Calendar Grid */}
      <CalendarGrid
        year={year}
        month={month}
        dailyData={dailyData}
        onDayClick={handleDayClick}
      />
      
      {/* Month Summary */}
      <MonthSummary dailyData={dailyData} trades={filteredTrades} />
      
      {/* Day Detail Modal */}
      {selectedDay && selectedDayData && (
        <DayDetailModal
          date={selectedDay}
          dayData={selectedDayData}
          trades={filteredTrades}
          strategies={strategies}
          onClose={() => {
            setSelectedDay(null);
            setSelectedDayData(null);
          }}
          onSelectTrade={(trade) => {
            setSelectedDay(null);
            setSelectedDayData(null);
            setSelectedTrade(trade);
          }}
        />
      )}
      
      {/* Trade Detail Modal */}
      {selectedTrade && (
        <TradeDetailModal
          trade={selectedTrade}
          strategyName={strategies[selectedTrade.strategy_id] || selectedTrade.strategy_id}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </div>
  );
};

export default TradeCalendar;
