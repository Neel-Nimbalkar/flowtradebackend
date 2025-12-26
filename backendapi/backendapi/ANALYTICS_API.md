# FlowGrid Analytics API Documentation

## Overview

The Analytics API provides comprehensive trading performance analytics, Flow Grade scoring, and real-time metric updates. All calculations use the backtest engine for consistency with fees, commissions, and slippage.

---

## Base URL

```
http://127.0.0.1:5000/api/analytics
```

---

## Endpoints

### 1. GET /api/analytics/overview

Get comprehensive analytics overview with all KPIs and Flow Grade.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled_only` | boolean | `true` | Only include trades from enabled strategies |
| `range` | string | `ALL` | Date range filter: `1D`, `1W`, `1M`, `3M`, `1Y`, `ALL` |

**Response (with data):**
```json
{
  "empty": false,
  "guidance": "",
  "kpis": {
    "net_pnl_usd": 1250.50,
    "net_pnl_pct": 2.50,
    "gross_pnl": 1350.00,
    "total_fees": 99.50,
    "win_rate": 56.0,
    "wins": 28,
    "losses": 22,
    "total_trades": 50,
    "profit_factor": 1.80,
    "expectancy": 25.01,
    "avg_win": 75.50,
    "avg_loss": 42.30,
    "max_drawdown_pct": 4.20,
    "max_drawdown_usd": 4200.00
  },
  "flow_grade": {
    "score": 72.5,
    "letter": "C",
    "empty": false,
    "components": {
      "net_return": {"value": 2.5, "score": 65.0, "weight": 0.28, "contribution": 18.2},
      "max_drawdown": {"value": 4.2, "score": 83.2, "weight": 0.22, "contribution": 18.3},
      "win_rate": {"value": 56.0, "score": 80.0, "weight": 0.16, "contribution": 12.8},
      "profit_factor": {"value": 1.8, "score": 60.0, "weight": 0.16, "contribution": 9.6},
      "win_loss_ratio": {"value": 1.79, "score": 59.6, "weight": 0.12, "contribution": 7.2},
      "concentration_penalty": {"value": 45.0, "penalty": 0}
    },
    "reasons": ["Strong drawdown control", "Moderate win rate", "Weak profit factor"],
    "suggestions": ["Let winners run longer to improve profit factor"],
    "trade_count": 50
  },
  "enabled_strategies": ["RSI Momentum", "MACD Crossover"],
  "total_strategies": 3,
  "account": {
    "starting_capital": 100000.0,
    "current_equity": 101250.50
  },
  "computed_at": "2025-12-14T10:30:00Z"
}
```

**Response (empty state):**
```json
{
  "empty": true,
  "guidance": "No trades yet. Enable a strategy or run a backtest to populate metrics.",
  "kpis": {},
  "flow_grade": {
    "score": 0,
    "letter": "F",
    "empty": true,
    "guidance": "No completed trades yet. Enable a strategy and let it execute to see your Flow Grade.",
    "components": {},
    "reasons": [],
    "suggestions": []
  },
  "enabled_strategies": [],
  "total_strategies": 3,
  "computed_at": "2025-12-14T10:30:00Z"
}
```

---

### 2. GET /api/analytics/flow-grade

Get Flow Grade performance score with detailed breakdown.

**Response:**
```json
{
  "score": 81.2,
  "letter": "B",
  "empty": false,
  "components": {
    "net_return": {
      "value": 5.2,
      "score": 71.4,
      "weight": 0.28,
      "contribution": 20.0
    },
    "max_drawdown": {
      "value": 3.1,
      "score": 87.6,
      "weight": 0.22,
      "contribution": 19.3
    },
    "win_rate": {
      "value": 62.0,
      "score": 88.6,
      "weight": 0.16,
      "contribution": 14.2
    },
    "profit_factor": {
      "value": 2.1,
      "score": 70.0,
      "weight": 0.16,
      "contribution": 11.2
    },
    "win_loss_ratio": {
      "value": 1.95,
      "score": 65.0,
      "weight": 0.12,
      "contribution": 7.8
    },
    "concentration_penalty": {
      "value": 35.0,
      "penalty": 0
    }
  },
  "reasons": [
    "Strong drawdown control",
    "Strong win rate",
    "Moderate return"
  ],
  "suggestions": [
    "Focus on higher-probability setups to improve win rate further",
    "Diversify across more strategies"
  ],
  "trade_count": 125,
  "computed_at": "2025-12-14T10:30:00Z"
}
```

---

### 3. GET /api/analytics/equity-curve

Get equity curve time-series data for charts.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeframe` | string | `ALL` | `1W`, `1M`, `3M`, `1Y`, `ALL` |
| `drawdown` | boolean | `true` | Include drawdown data |

**Response:**
```json
{
  "empty": false,
  "curve": [
    {"t": 1702540800000, "v": 100000.00, "drawdown": 0},
    {"t": 1702627200000, "v": 100250.50, "drawdown": 0},
    {"t": 1702713600000, "v": 99850.25, "drawdown": 0.4},
    {"t": 1702800000000, "v": 101250.50, "drawdown": 0}
  ],
  "starting_capital": 100000.0,
  "current_equity": 101250.50,
  "data_points": 30
}
```

---

### 4. GET /api/analytics/trades

Get paginated trades list with filtering.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | `1` | Page number |
| `per_page` | int | `50` | Items per page |
| `strategy` | string | - | Filter by strategy name |
| `symbol` | string | - | Filter by symbol |
| `sort_by` | string | `timestamp` | `timestamp`, `pnl`, `symbol` |
| `sort_order` | string | `desc` | `asc`, `desc` |

**Response:**
```json
{
  "empty": false,
  "trades": [
    {
      "id": "trade_exit_45",
      "type": "exit",
      "symbol": "AAPL",
      "strategy_name": "RSI Momentum",
      "direction": "LONG",
      "price": 175.50,
      "entry_price": 172.25,
      "qty": 50,
      "pnl": 162.50,
      "pnl_formatted": "$162.50",
      "is_win": true,
      "commission": 0.50,
      "net_pnl": 162.00,
      "timestamp": "2025-12-14T09:45:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 125,
    "total_pages": 3,
    "has_next": true,
    "has_prev": false
  }
}
```

---

### 5. GET /api/analytics/distributions

Get P&L or duration distribution histograms.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | `pnl` | `pnl` or `duration` |
| `bins` | int | `20` | Number of histogram bins |

**Response (P&L):**
```json
{
  "empty": false,
  "histogram": [
    {"bin_start": -500.00, "bin_end": -400.00, "count": 2},
    {"bin_start": -400.00, "bin_end": -300.00, "count": 5},
    {"bin_start": -300.00, "bin_end": -200.00, "count": 8},
    {"bin_start": -200.00, "bin_end": -100.00, "count": 12},
    {"bin_start": -100.00, "bin_end": 0.00, "count": 15},
    {"bin_start": 0.00, "bin_end": 100.00, "count": 25},
    {"bin_start": 100.00, "bin_end": 200.00, "count": 20},
    {"bin_start": 200.00, "bin_end": 300.00, "count": 18},
    {"bin_start": 300.00, "bin_end": 400.00, "count": 12},
    {"bin_start": 400.00, "bin_end": 500.00, "count": 8}
  ],
  "stats": {
    "mean": 75.50,
    "median": 85.00,
    "std": 185.25,
    "min": -485.00,
    "max": 520.00,
    "total_trades": 125,
    "win_count": 70,
    "loss_count": 55,
    "avg_win": 142.50,
    "avg_loss": -95.30
  }
}
```

---

### 6. GET /api/analytics/heatmap

Get P&L heatmap by hour/day or instrument.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | `hour_day` | `hour_day` or `instrument` |

**Response (hour_day):**
```json
{
  "empty": false,
  "type": "hour_day",
  "x_labels": ["9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"],
  "y_labels": ["Mon", "Tue", "Wed", "Thu", "Fri"],
  "matrix": [
    [125.50, 85.00, -45.00, 210.00, -15.00, 180.00, 95.00, 55.00],
    [95.00, 145.00, 75.00, -85.00, 125.00, 65.00, -25.00, 110.00],
    [180.00, -35.00, 225.00, 95.00, -65.00, 145.00, 85.00, -15.00],
    [65.00, 195.00, -55.00, 135.00, 85.00, -95.00, 165.00, 45.00],
    [145.00, 75.00, 115.00, -25.00, 185.00, 55.00, 95.00, 125.00]
  ],
  "counts": [
    [3, 2, 1, 4, 1, 3, 2, 2],
    [2, 3, 2, 2, 3, 2, 1, 3],
    [4, 1, 5, 3, 2, 3, 2, 1],
    [2, 4, 2, 3, 2, 2, 4, 2],
    [3, 2, 3, 1, 4, 2, 3, 3]
  ],
  "range": {"min": -95.00, "max": 225.00},
  "best_slot": {"day": "Wed", "hour": "11:00", "pnl": 225.00},
  "worst_slot": {"day": "Thu", "hour": "14:00", "pnl": -95.00}
}
```

---

### 7. GET /api/analytics/strategy-contrib

Get strategy contribution analysis.

**Response:**
```json
{
  "empty": false,
  "total_pnl": 1250.50,
  "strategy_count": 3,
  "contributions": [
    {
      "strategy_name": "RSI Momentum",
      "pnl": 850.25,
      "trades": 45,
      "win_rate": 62.0,
      "contribution_pct": 68.0,
      "waterfall_start": 0,
      "waterfall_end": 850.25
    },
    {
      "strategy_name": "MACD Crossover",
      "pnl": 525.75,
      "trades": 38,
      "win_rate": 55.0,
      "contribution_pct": 42.0,
      "waterfall_start": 850.25,
      "waterfall_end": 1376.00
    },
    {
      "strategy_name": "Bollinger Breakout",
      "pnl": -125.50,
      "trades": 17,
      "win_rate": 35.0,
      "contribution_pct": -10.0,
      "waterfall_start": 1376.00,
      "waterfall_end": 1250.50
    }
  ],
  "top_performer": "RSI Momentum",
  "bottom_performer": "Bollinger Breakout"
}
```

---

### 8. GET /api/analytics/montecarlo

Get Monte Carlo simulation results.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `simulations` | int | `1000` | Number of simulations |
| `premium` | boolean | `false` | Enable premium features |

**Response (Free):**
```json
{
  "empty": false,
  "simulations": 100,
  "trade_count": 125,
  "percentiles": {
    "5th": 92500.00,
    "25th": 98000.00,
    "50th": 101250.00,
    "75th": 105500.00,
    "95th": 112000.00
  },
  "mean_final_equity": 101850.00,
  "prob_profit": 72.0,
  "prob_loss_10pct": 5.0,
  "worst_case": 85000.00,
  "best_case": 125000.00,
  "is_premium": false,
  "premium_cta": "Upgrade to Premium for full Monte Carlo with path visualization and probability metrics."
}
```

**Response (Premium):**
```json
{
  "empty": false,
  "simulations": 1000,
  "trade_count": 125,
  "percentiles": {
    "5th": 92500.00,
    "25th": 98000.00,
    "50th": 101250.00,
    "75th": 105500.00,
    "95th": 112000.00
  },
  "mean_final_equity": 101850.00,
  "prob_profit": 72.0,
  "prob_loss_10pct": 5.0,
  "worst_case": 85000.00,
  "best_case": 125000.00,
  "is_premium": true,
  "bands": {
    "p5": [100000, 99500, 99000, 98500, ...],
    "p25": [100000, 100200, 100400, 100600, ...],
    "p50": [100000, 100500, 101000, 101500, ...],
    "p75": [100000, 101000, 102000, 103000, ...],
    "p95": [100000, 102000, 104000, 106000, ...]
  }
}
```

---

### 9. POST /api/analytics/recompute

Trigger a metrics recompute job.

**Request Body:**
```json
{
  "enabled_strategies": ["RSI Momentum", "MACD Crossover"],
  "trigger": "toggle"
}
```

**Response:**
```json
{
  "job_id": "abc123-def456-ghi789",
  "status": "pending"
}
```

---

### 10. GET /api/analytics/recompute/{job_id}/status

Get status of a recompute job.

**Response:**
```json
{
  "job_id": "abc123-def456-ghi789",
  "status": "completed",
  "progress": 100,
  "enabled_strategies": ["RSI Momentum", "MACD Crossover"],
  "trigger": "toggle",
  "created_at": "2025-12-14T10:30:00Z",
  "started_at": "2025-12-14T10:30:01Z",
  "completed_at": "2025-12-14T10:30:02Z",
  "error": null
}
```

---

### 11. GET /api/analytics/recent-activity

Get recent signals and trade events.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | `20` | Maximum number of items |

**Response:**
```json
{
  "empty": false,
  "guidance": "",
  "activity": [
    {
      "id": "trade_exit_125",
      "type": "exit",
      "symbol": "AAPL",
      "strategy_name": "RSI Momentum",
      "direction": "LONG",
      "price": 175.50,
      "pnl": 162.50,
      "timestamp": "2025-12-14T10:25:00Z",
      "icon": "🔴"
    },
    {
      "id": "trade_entry_126",
      "type": "entry",
      "symbol": "GOOGL",
      "strategy_name": "MACD Crossover",
      "direction": "LONG",
      "price": 142.25,
      "pnl": null,
      "timestamp": "2025-12-14T10:22:00Z",
      "icon": "🟢"
    }
  ],
  "total": 20
}
```

---

### 12. SSE /api/analytics/stream

Server-Sent Events stream for live updates.

**Events:**

1. **connected** - Initial connection confirmation
```
event: connected
data: {"status": "connected", "timestamp": "2025-12-14T10:30:00Z"}
```

2. **metrics_update** - New metrics available
```
event: metrics_update
data: {"empty": false, "kpis": {...}, "flow_grade": {...}}
```

3. **heartbeat** - Keep-alive every 30 seconds
```
event: heartbeat
data: {"timestamp": "2025-12-14T10:30:30Z"}
```

4. **error** - Error occurred
```
event: error
data: {"error": "Connection lost"}
```

---

## Flow Grade Algorithm

### Formula

```
FlowGrade = Σ(component_score × weight) - concentration_penalty

Components:
- Net Return % (28%): Scaled -20% → 0, 0% → 50, +50% → 100
- Max Drawdown (22%, inverted): 0% → 100, 25% → 0
- Win Rate (16%): 0% → 0, 50% → 50, 70%+ → 100
- Profit Factor (16%): 0 → 0, 1 → 40, 2 → 70, 3+ → 100
- Win/Loss Ratio (12%): 0 → 0, 1 → 40, 2 → 70, 3+ → 100

Concentration Penalty: -10% if >80% trades from one strategy
```

### Letter Grade Mapping

| Score | Grade |
|-------|-------|
| 90-100 | A |
| 75-89 | B |
| 60-74 | C |
| 40-59 | D |
| <40 | F |

---

## Premium Features ($99/mo)

| Feature | Free | Premium |
|---------|------|---------|
| Monte Carlo Simulations | 100 | 1000+ |
| Monte Carlo Band Paths | ❌ | ✅ |
| Flow Grade History | ❌ | ✅ |
| Multi-Account Aggregation | ❌ | ✅ |
| Long Data Retention | 30 days | 5+ years |
| Real-time Stream Rate | 5s | 1s |
| Advanced Alerts | ❌ | ✅ |
| PDF Reports | ❌ | ✅ |

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `400` - Bad request (invalid parameters)
- `404` - Resource not found
- `500` - Internal server error
