import React, { useState } from 'react';
import './MonthlyReturns.css';

const MonthlyReturns = ({ results }) => {
  const { trades } = results;
  const [selectedMonth, setSelectedMonth] = useState(null);

  if (!trades || trades.length === 0) {
    return <div className="monthly-returns-empty">No trades to analyze</div>;
  }

  const monthlyData = calculateMonthlyReturns(trades);

  const formatPercent = (val) => val >= 0 ? `+${val.toFixed(1)}%` : `${val.toFixed(1)}%`;
  const formatCurrency = (val) => val >= 0 ? `+$${val.toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}`;

  const getColor = (value) => {
    if (value > 5) return '#059669';
    if (value > 2) return '#10b981';
    if (value > 0) return '#6ee7b7';
    if (value > -2) return '#fca5a5';
    if (value > -5) return '#ef4444';
    return '#dc2626';
  };

  const getIntensity = (value) => {
    const abs = Math.abs(value);
    if (abs > 10) return 1;
    if (abs > 5) return 0.8;
    if (abs > 2) return 0.6;
    if (abs > 0) return 0.4;
    return 0.2;
  };

  const handleMonthClick = (year, month) => {
    const key = `${year}-${month}`;
    if (monthlyData.dailyData[key]) {
      setSelectedMonth({ year, month, key });
    }
  };

  const handleCloseModal = () => {
    setSelectedMonth(null);
  };

  return (
    <div className="monthly-returns">
      {/* Daily Breakdown - shown above when month is selected */}
      {selectedMonth && (
        <div className="month-breakdown">
          <div className="breakdown-header">
            <h3>
              Month Breakdown - {['January', 'February', 'March', 'April', 'May', 'June', 
                'July', 'August', 'September', 'October', 'November', 'December'][selectedMonth.month]} {selectedMonth.year}
            </h3>
            <button className="close-breakdown-btn" onClick={handleCloseModal}>×</button>
          </div>
          
          <div className="breakdown-body">
            {monthlyData.dailyData[selectedMonth.key] && monthlyData.dailyData[selectedMonth.key].length > 0 ? (
              <>
                <div className="daily-summary">
                  <div className="daily-summary-card">
                    <span className="summary-label">Total Return:</span>
                    <span className="summary-value" style={{ 
                      color: monthlyData.dailyData[selectedMonth.key].reduce((sum, d) => sum + d.returnPct, 0) > 0 
                        ? '#10b981' : '#ef4444' 
                    }}>
                      {formatPercent(monthlyData.dailyData[selectedMonth.key].reduce((sum, d) => sum + d.returnPct, 0))}
                    </span>
                  </div>
                  <div className="daily-summary-card">
                    <span className="summary-label">Trading Days:</span>
                    <span className="summary-value">{monthlyData.dailyData[selectedMonth.key].length}</span>
                  </div>
                  <div className="daily-summary-card">
                    <span className="summary-label">Win Days:</span>
                    <span className="summary-value" style={{ color: '#10b981' }}>
                      {monthlyData.dailyData[selectedMonth.key].filter(d => d.returnPct > 0).length}
                    </span>
                  </div>
                  <div className="daily-summary-card">
                    <span className="summary-label">Loss Days:</span>
                    <span className="summary-value" style={{ color: '#ef4444' }}>
                      {monthlyData.dailyData[selectedMonth.key].filter(d => d.returnPct < 0).length}
                    </span>
                  </div>
                </div>

                <div className="daily-returns-table">
                  <div className="daily-table-header">
                    <div className="daily-col-date">Date</div>
                    <div className="daily-col-trades">Trades</div>
                    <div className="daily-col-pnl">P&L</div>
                    <div className="daily-col-return">Return %</div>
                    <div className="daily-col-winrate">Win Rate</div>
                  </div>
                  <div className="daily-table-body">
                    {monthlyData.dailyData[selectedMonth.key].map((day, idx) => (
                      <div key={idx} className="daily-table-row">
                        <div className="daily-col-date">
                          <span className="day-name">{day.dayName}</span>
                          <span className="date-num">{day.date}</span>
                        </div>
                        <div className="daily-col-trades">{day.trades}</div>
                        <div className="daily-col-pnl" style={{ color: day.profit > 0 ? '#10b981' : '#ef4444' }}>
                          {formatCurrency(day.profit)}
                        </div>
                        <div className="daily-col-return">
                          <div className="return-bar-container">
                            <div 
                              className="return-bar" 
                              style={{ 
                                width: `${Math.min(Math.abs(day.returnPct) * 10, 100)}%`,
                                backgroundColor: day.returnPct > 0 ? '#10b981' : '#ef4444'
                              }}
                            />
                            <span className="return-value" style={{ color: day.returnPct > 0 ? '#10b981' : '#ef4444' }}>
                              {formatPercent(day.returnPct)}
                            </span>
                          </div>
                        </div>
                        <div className="daily-col-winrate">
                          {day.wins > 0 || day.losses > 0 
                            ? `${((day.wins / (day.wins + day.losses)) * 100).toFixed(0)}%`
                            : '-'
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="no-daily-data">No trading data for this month</div>
            )}
          </div>
        </div>
      )}

      <div className="returns-header">
        <h3>Monthly Returns</h3>
        <div className="returns-legend">
          <span className="legend-label">Returns:</span>
          <div className="legend-gradient">
            <span>-10%</span>
            <div className="gradient-bar"></div>
            <span>+10%</span>
          </div>
        </div>
      </div>

      <div className="returns-table">
        <div className="returns-grid">
          <div className="returns-header-cell corner"></div>
          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
            <div key={month} className="returns-header-cell">{month}</div>
          ))}
          <div className="returns-header-cell">Year</div>

          {monthlyData.years.map(yearData => (
            <React.Fragment key={yearData.year}>
              <div className="returns-year-cell">{yearData.year}</div>
              {yearData.months.map((monthReturn, idx) => (
                <div
                  key={idx}
                  className={`returns-cell ${monthReturn !== null ? 'clickable' : ''}`}
                  style={{
                    backgroundColor: monthReturn !== null ? getColor(monthReturn) : 'transparent',
                    opacity: monthReturn !== null ? getIntensity(monthReturn) : 0.1
                  }}
                  title={monthReturn !== null ? formatPercent(monthReturn) : 'No data'}
                  onClick={() => monthReturn !== null && handleMonthClick(yearData.year, idx)}
                >
                  {monthReturn !== null && (
                    <span className="cell-value">{formatPercent(monthReturn)}</span>
                  )}
                </div>
              ))}
              <div
                className="returns-year-total"
                style={{
                  backgroundColor: getColor(yearData.yearTotal),
                  opacity: getIntensity(yearData.yearTotal)
                }}
              >
                <span className="cell-value">{formatPercent(yearData.yearTotal)}</span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="returns-summary">
        <div className="summary-stat">
          <span className="stat-label">Best Month:</span>
          <span className="stat-value" style={{ color: '#10b981' }}>
            {formatPercent(monthlyData.bestMonth.value)} ({monthlyData.bestMonth.label})
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Worst Month:</span>
          <span className="stat-value" style={{ color: '#ef4444' }}>
            {formatPercent(monthlyData.worstMonth.value)} ({monthlyData.worstMonth.label})
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Avg Monthly Return:</span>
          <span className="stat-value" style={{ color: monthlyData.avgMonthly > 0 ? '#10b981' : '#ef4444' }}>
            {formatPercent(monthlyData.avgMonthly)}
          </span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Positive Months:</span>
          <span className="stat-value">{monthlyData.positiveMonths} / {monthlyData.totalMonths}</span>
        </div>
      </div>
    </div>
  );
};

function calculateMonthlyReturns(trades) {
  const monthlyReturns = {};
  const dailyReturns = {};
  
  // Group trades by month and day
  trades.forEach(trade => {
    const exitDate = new Date(trade.exitTime);
    const year = exitDate.getFullYear();
    const month = exitDate.getMonth(); // 0-11
    const day = exitDate.getDate();
    
    // Monthly data
    const monthKey = `${year}-${month}`;
    if (!monthlyReturns[monthKey]) {
      monthlyReturns[monthKey] = { year, month, profit: 0, returnPct: 0 };
    }
    monthlyReturns[monthKey].profit += trade.netProfit;
    monthlyReturns[monthKey].returnPct += trade.profitPercent;

    // Daily data
    const dayKey = `${year}-${month}-${day}`;
    if (!dailyReturns[dayKey]) {
      dailyReturns[dayKey] = { 
        year, month, day, 
        profit: 0, 
        returnPct: 0, 
        trades: 0,
        wins: 0,
        losses: 0,
        date: exitDate
      };
    }
    dailyReturns[dayKey].profit += trade.netProfit;
    dailyReturns[dayKey].returnPct += trade.profitPercent;
    dailyReturns[dayKey].trades++;
    if (trade.netProfit > 0) {
      dailyReturns[dayKey].wins++;
    } else {
      dailyReturns[dayKey].losses++;
    }
  });

  // Get unique years
  const years = [...new Set(Object.values(monthlyReturns).map(m => m.year))].sort();
  
  const yearData = years.map(year => {
    const months = Array(12).fill(null);
    let yearTotal = 0;
    
    for (let m = 0; m < 12; m++) {
      const key = `${year}-${m}`;
      if (monthlyReturns[key]) {
        months[m] = monthlyReturns[key].returnPct;
        yearTotal += monthlyReturns[key].returnPct;
      }
    }
    
    return { year, months, yearTotal };
  });

  // Calculate statistics
  const allMonths = Object.values(monthlyReturns).map(m => m.returnPct);
  const positiveMonths = allMonths.filter(m => m > 0).length;
  const bestMonth = allMonths.length > 0 
    ? Math.max(...allMonths)
    : 0;
  const worstMonth = allMonths.length > 0 
    ? Math.min(...allMonths)
    : 0;
  const avgMonthly = allMonths.length > 0 
    ? allMonths.reduce((a, b) => a + b, 0) / allMonths.length
    : 0;

  // Find labels for best/worst
  const bestEntry = Object.entries(monthlyReturns).find(([, data]) => data.returnPct === bestMonth);
  const worstEntry = Object.entries(monthlyReturns).find(([, data]) => data.returnPct === worstMonth);
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const bestLabel = bestEntry ? `${monthNames[bestEntry[1].month]} ${bestEntry[1].year}` : 'N/A';
  const worstLabel = worstEntry ? `${monthNames[worstEntry[1].month]} ${worstEntry[1].year}` : 'N/A';

  // Organize daily data by month
  const dailyDataByMonth = {};
  Object.entries(dailyReturns).forEach(([key, data]) => {
    const monthKey = `${data.year}-${data.month}`;
    if (!dailyDataByMonth[monthKey]) {
      dailyDataByMonth[monthKey] = [];
    }
    dailyDataByMonth[monthKey].push({
      ...data,
      dayName: dayNames[data.date.getDay()],
      date: `${monthNames[data.month]} ${data.day}`
    });
  });

  // Sort daily data by date
  Object.keys(dailyDataByMonth).forEach(monthKey => {
    dailyDataByMonth[monthKey].sort((a, b) => a.day - b.day);
  });

  return {
    years: yearData,
    bestMonth: { value: bestMonth, label: bestLabel },
    worstMonth: { value: worstMonth, label: worstLabel },
    avgMonthly,
    positiveMonths,
    totalMonths: allMonths.length,
    dailyData: dailyDataByMonth
  };
}

export default MonthlyReturns;
