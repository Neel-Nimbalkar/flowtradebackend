# FlowGrid Trading - Complete System Workflow

> **A percentage-based algorithmic trading platform with visual strategy builder, real-time signal generation, and comprehensive analytics.**

---

## 📖 Table of Contents

1. [System Overview](#system-overview)
2. [Complete User Journey](#complete-user-journey)
3. [The Math Behind Trades](#the-math-behind-trades)
4. [Analytics & Metrics](#analytics--metrics)
5. [Architecture](#architecture)
6. [Quick Start](#quick-start)
7. [API Reference](#api-reference)
cd backendapi
python -m api.backend

cd frontend
npm run dev
---

## 🎯 System Overview

FlowGrid Trading is a complete algorithmic trading workflow that takes you from strategy design to live execution and analytics—all using **percentage-based P&L** (no dollar amounts).

### Key Features

- **Visual Strategy Builder** - Drag-and-drop workflow designer with indicators (RSI, MACD, EMA, Bollinger Bands, etc.)
- **Real-Time Signal Generation** - 1-second polling for enabled strategies
- **Percent-Only Trade Engine** - Alternating LONG↔SHORT positions with automatic P&L calculation
- **Comprehensive Analytics** - Win rate, profit factor, expectancy, max drawdown, equity curves
- **Live Dashboard** - Real-time KPIs, charts, and current signals
- **Trade Logging** - Filterable history with CSV/JSON export
- **Trade Calendar** - Monthly heatmap visualization

---

## 🚀 Complete User Journey

### Step 1: Sign In
User authenticates and creates a session.

### Step 2: Build a Strategy

Navigate to **Strategy Builder** (`WorkflowBuilder.jsx`)

```
1. Add Nodes:
   - Input Node (symbol: AAPL, timeframe: 1d)
   - Indicator Node (RSI, period: 14)
   - Condition Node (RSI < 30 = oversold)
   - Output Node (signal: BUY)

2. Connect nodes with edges (data flows through connections)

3. Configure parameters (oversold/overbought thresholds, etc.)

4. Test the workflow:
   - Click "Run Workflow"
   - Backend executes: POST /api/workflows/execute_v2
   - Returns finalSignal: BUY/SELL/HOLD

5. Save the strategy:
   - Click "Save Strategy"
   - Stored in localStorage with unique ID
```

### Step 3: Enable Strategy in Dashboard

Navigate to **Dashboard** (`Dashboard.jsx`)

```
1. View saved strategies in "My Strategies" panel

2. Toggle strategy ON:
   - Max 5 concurrent strategies allowed
   - StrategyRunner.js starts 1-second polling loop
   
3. Strategy begins generating signals automatically
```

### Step 4: Signal Generation (Live Polling)

**Every 1 second per enabled strategy:**

```
StrategyRunner.executeWorkflow()
    ↓
POST /api/workflows/execute_v2
{
  symbol: "AAPL",
  timeframe: "1d",
  workflow_blocks: [...]
}
    ↓
Backend returns:
{
  finalSignal: "BUY",  // or SELL or HOLD
  last_price: 150.25
}
    ↓
Frontend de-duplicates signals:
- If signal unchanged from last poll → IGNORE
- If signal changed → Update UI + send to trade engine
    ↓
POST /api/signals/ingest
{
  strategy_id: "workflow-2025-12-14...",
  signal: "BUY",
  price: 150.25,
  ts: "2025-12-15T21:00:00Z"
}
```

### Step 5: Trade Calculation (State Machine)

**Trade Engine (`trade_engine.py`) processes the signal:**

```
┌─────────────────────────────────────┐
│ State Machine per Strategy:        │
│                                     │
│ Current State:                      │
│  - position: NONE | LONG | SHORT    │
│  - lastSignal: BUY | SELL | null    │
└─────────────────────────────────────┘

Signal Processing Logic:

IF signal == lastSignal:
  → IGNORE (duplicate)

IF position == NONE:
  → OPEN position
  → side = (signal == BUY) ? LONG : SHORT
  → Store: entry_price, entry_ts
  → No completed trade yet

IF position != NONE AND signal != lastSignal:
  → CLOSE existing position
  → CALCULATE trade P&L (see math below)
  → SAVE completed trade to percent_trades.json
  → IMMEDIATELY open opposite position
```

### Step 6: Trade P&L Calculation (THE MATH)

#### Example 1: LONG → SHORT Transition

**Close LONG position:**
```
Entry Price:  $100.00  (when BUY signal received)
Exit Price:   $105.00  (when SELL signal received)

LONG Gross % Formula:
┌─────────────────────────────────────────────┐
│ gross_pct = ((exit / entry) - 1) × 100      │
│           = ((105 / 100) - 1) × 100         │
│           = (1.05 - 1) × 100                │
│           = 0.05 × 100                      │
│           = 5.00%                           │
└─────────────────────────────────────────────┘

Subtract Fees:
┌─────────────────────────────────────────────┐
│ fee_pct_total = commission + slippage       │
│               = 0.1% + 0.05%                │
│               = 0.15%                       │
│                                             │
│ net_pct = gross_pct - fee_pct_total        │
│         = 5.00% - 0.15%                     │
│         = 4.85%  ← FINAL RESULT             │
└─────────────────────────────────────────────┘
```

**Open SHORT position:**
```
Entry Price: $105.00 (new SHORT at SELL signal)
Wait for next BUY signal to close...
```

#### Example 2: SHORT → LONG Transition

**Close SHORT position:**
```
Entry Price:  $105.00  (when SELL signal opened SHORT)
Exit Price:   $102.00  (when BUY signal received)

SHORT Gross % Formula:
┌─────────────────────────────────────────────┐
│ gross_pct = ((entry / exit) - 1) × 100      │
│           = ((105 / 102) - 1) × 100         │
│           = (1.0294 - 1) × 100              │
│           = 0.0294 × 100                    │
│           = 2.94%                           │
└─────────────────────────────────────────────┘

Subtract Fees:
┌─────────────────────────────────────────────┐
│ net_pct = 2.94% - 0.15% = 2.79%            │
└─────────────────────────────────────────────┘
```

**Open LONG position:**
```
Entry Price: $102.00 (new LONG at BUY signal)
Wait for next SELL signal to close...
```

#### Trade Record Saved to `percent_trades.json`:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "strategy_id": "workflow-2025-12-14T21-59-34-099Z",
  "open_side": "LONG",
  "open_price": 100.00,
  "open_ts": "2025-12-15T21:00:00Z",
  "close_side": "SHORT",
  "close_price": 105.00,
  "close_ts": "2025-12-15T21:05:00Z",
  "gross_pct": 5.00,
  "fee_pct_total": 0.15,
  "net_pct": 4.85,
  "meta": { "source": "live_signal" }
}
```

### Step 7: Analytics Calculation

**Backend: GET /api/analytics/overview**

Loads all trades from `percent_trades.json` and computes:

#### 1. Total Trades
```
total_trades = count(trades)
```

#### 2. Wins & Losses
```
wins = count(trade.net_pct > 0)
losses = count(trade.net_pct < 0)
```

#### 3. Win Rate
```
win_rate = (wins / total_trades) × 100
Example: (45 / 100) × 100 = 45%
```

#### 4. Net Return %
```
net_return = sum(all trade.net_pct)
Example: 4.85% + 2.79% + (-1.2%) + ... = 12.5%
```

#### 5. Average Win %
```
avg_win = sum(winning trades net_pct) / wins
Example: (4.85 + 2.79 + 3.1) / 45 = 2.39%
```

#### 6. Average Loss %
```
avg_loss = sum(losing trades net_pct) / losses
Example: (-1.2 + -0.8 + -1.5) / 55 = -0.64%
```

#### 7. Largest Win & Loss
```
largest_win = max(trade.net_pct where net_pct > 0)
largest_loss = min(trade.net_pct where net_pct < 0)
```

#### 8. Profit Factor
```
profit_factor = sum(winning net_pct) / |sum(losing net_pct)|
Example: 107.55% / 35.2% = 3.05
(> 1.0 = profitable system)
```

#### 9. Expectancy (Expected Return Per Trade)
```
expectancy = (win_rate × avg_win) + ((1 - win_rate) × avg_loss)
Example: (0.45 × 2.39) + (0.55 × -0.64)
       = 1.08 + (-0.35)
       = 0.73%
```

#### 10. Max Drawdown %
```
Calculate running equity:
  equity[0] = 100%
  equity[i] = equity[i-1] × (1 + net_pct[i] / 100)

Track peak and max drop:
  peak[i] = max(peak[i-1], equity[i])
  drawdown[i] = (equity[i] - peak[i]) / peak[i] × 100

max_drawdown = min(drawdown[])

Example:
  Peak: 112.5%
  Trough: 105.3%
  Drawdown = (105.3 - 112.5) / 112.5 × 100 = -6.4%
```

#### 11. Running Equity (for charts)
```
Starting equity = 100%

After trade 1: 100% × (1 + 4.85/100) = 104.85%
After trade 2: 104.85% × (1 + 2.79/100) = 107.77%
After trade 3: 107.77% × (1 + (-1.2)/100) = 106.48%
...continues for all trades
```

### Step 8: Dashboard Display

**Dashboard.jsx renders analytics:**

```
┌─────────────────────────────────────────┐
│ KPI Cards:                              │
│  • Net Return: +12.5%       [green]     │
│  • Win Rate: 45%            [neutral]   │
│  • Total Trades: 100        [neutral]   │
│  • Max Drawdown: -6.4%      [red]       │
│  • Profit Factor: 3.05      [green]     │
│  • Expectancy: +0.73%       [green]     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Account Performance Chart:              │
│  • X-axis: Time                         │
│  • Y-axis: Equity %                     │
│  • Running equity curve                 │
│  • Drawdown areas shaded in red         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Current Signals Panel:                  │
│  • Latest signal per enabled strategy   │
│  • De-duplicated (changes only)         │
│  • Color-coded: BUY/SELL/HOLD           │
└─────────────────────────────────────────┘
```

### Step 9: Analytics Page (Detailed Views)

Navigate to **Analytics** in main navigation

#### Overview Tab
- Same KPIs as dashboard
- Equity curve chart
- Strategy contribution breakdown

#### Trade Logging Tab
```
Filterable trade table:
┌────────────────────────────────────────────────────────┐
│ ID | Strategy | Side | Entry | Exit | Duration | Net % │
├────────────────────────────────────────────────────────┤
│ 550e | RSI Strat | LONG | 100.00 | 105.00 | 5m | +4.85%│
│ 8a3f | RSI Strat | SHORT| 105.00 | 102.00 | 10m| +2.79%│
└────────────────────────────────────────────────────────┘

Features:
• Export CSV/JSON
• Click row → Trade Detail Modal
• Filter by strategy, date range, win/loss
```

#### Trade Calendar Tab
```
Monthly heatmap:
┌────────────────────────────────────┐
│ Mon  Tue  Wed  Thu  Fri  Sat  Sun │
│ [1]  [2]  [3]  [4]  [5]  [6]  [7] │
│     +0.5 +1.2 -0.3 +2.1 +0.8 -0.2  │
└────────────────────────────────────┘

Color scale: red (loss) → gray (no trades) → green (profit)

Hover day → popover shows:
• Total trades
• Net P&L %
• Win rate
• Best/worst trade

Click day → filter trades by date
Month summary panel at bottom
```

---

## 🧮 The Math Behind Trades

### Core Formulas

#### 1. LONG Position Gross %
```
gross_pct = ((exit_price / entry_price) - 1) × 100
```

#### 2. SHORT Position Gross %
```
gross_pct = ((entry_price / exit_price) - 1) × 100
```

#### 3. Net P&L %
```
net_pct = gross_pct - fee_pct_total
```

#### 4. Win Rate
```
win_rate = (number_of_wins / total_trades) × 100
```

#### 5. Profit Factor
```
profit_factor = sum(winning_trades_pct) / |sum(losing_trades_pct)|
```

#### 6. Expectancy
```
expectancy = (win_rate × avg_win_pct) + ((1 - win_rate) × avg_loss_pct)
```

#### 7. Max Drawdown %
```
For each trade i:
  equity[i] = equity[i-1] × (1 + net_pct[i] / 100)
  peak[i] = max(peak[i-1], equity[i])
  drawdown[i] = (equity[i] - peak[i]) / peak[i] × 100

max_drawdown = min(drawdown[])
```

---

## 📊 Analytics & Metrics

### Dashboard KPIs

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Net Return %** | Sum of all net_pct | Total cumulative return |
| **Win Rate %** | (Wins / Total) × 100 | Percentage of profitable trades |
| **Total Trades** | Count of completed trades | Volume of activity |
| **Max Drawdown %** | Largest peak-to-trough drop | Worst sustained loss |
| **Profit Factor** | Sum(wins) / Sum(losses) | > 1.0 = profitable |
| **Expectancy %** | Expected return per trade | Average edge per trade |
| **Avg Win %** | Average of winning trades | Typical winner size |
| **Avg Loss %** | Average of losing trades | Typical loser size |

### Trade States & Guarantees

✅ **System Guarantees:**
- No HOLD trades recorded (only BUY↔SELL alternations)
- All metrics are percentage-based (no USD amounts)
- Duplicate signals ignored (only changes trigger actions)
- Max 5 concurrent strategies enforced
- Positions persist across restarts
- Real-time UI updates on trade completion
- All analytics computed from single source of truth (trade engine)

---

## 🏗️ Architecture

### Technology Stack

#### Backend
- **Python 3.11+**
- **Flask** - REST API server
- **Alpaca API** - Market data (IEX feed)
- **ta library** - Technical indicators
- **yfinance** - Historical data fallback

#### Frontend
- **React 18**
- **Vite** - Build tool & dev server
- **Canvas API** - Chart rendering
- **LocalStorage** - Strategy persistence

### Project Structure

```
FlowGrid Trading/
├── backendapi/
│   ├── api/
│   │   ├── backend.py          # Flask API server
│   │   ├── trade_engine.py     # State machine & P&L calculator
│   │   └── flowgrid_ws.py      # WebSocket support
│   ├── indicators/             # Technical indicators
│   ├── data/                   # Persistence layer
│   │   ├── positions.json      # Current open positions
│   │   ├── percent_trades.json # Completed trades
│   │   └── analytics_cache.json# Pre-computed metrics
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx           # Main dashboard
│   │   │   ├── AnalyticsPage.jsx       # Analytics tabs
│   │   │   ├── WorkflowBuilder.jsx     # Strategy builder
│   │   │   └── analytics/
│   │   │       ├── TradeLogging.jsx    # Trade history
│   │   │       └── TradeCalendar.jsx   # Heatmap calendar
│   │   ├── services/
│   │   │   └── StrategyRunner.js       # Signal polling
│   │   └── components/
│   │       └── Backtest/               # Reusable tables
│   └── package.json
│
├── WORKFLOW.md              # This document
└── README.md                # You are here
```

### Data Flow Architecture

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────────────────────┐
│         Strategy Builder (React)            │
│  • Visual workflow designer                 │
│  • Node/edge graph                          │
│  • Save to localStorage                     │
└──────┬──────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────┐
│         Dashboard (React)                   │
│  • Toggle strategies on/off                 │
│  • Display KPIs & charts                    │
│  • Show current signals                     │
└──────┬──────────────────────────────────────┘
       │
       ↓ (1-second polling)
┌─────────────────────────────────────────────┐
│      StrategyRunner.js (Frontend)           │
│  • Poll enabled strategies                  │
│  • De-duplicate signals                     │
│  • Send signals to backend                  │
└──────┬──────────────────────────────────────┘
       │
       ↓ POST /api/signals/ingest
┌─────────────────────────────────────────────┐
│      Trade Engine (Backend)                 │
│  • State machine (NONE→LONG→SHORT)          │
│  • Calculate percent P&L                    │
│  • Save completed trades                    │
│  • Compute analytics                        │
└──────┬──────────────────────────────────────┘
       │
       ↓ Event: 'flowgrid:trade-completed'
┌─────────────────────────────────────────────┐
│      Dashboard UI (React)                   │
│  • Update KPIs in real-time                 │
│  • Refresh equity curve                     │
│  • Show latest trades                       │
└─────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Git**

### Installation

```bash
# Clone the repository
cd "FlowGrid Trading"

# Install backend dependencies
cd backendapi
pip install -r requirements.txt

# Install frontend dependencies
cd ../frontend
npm install
```

### Configuration

Create `.env` file in `backendapi/`:

```env
ALPACA_API_KEY=your_key_here
ALPACA_SECRET_KEY=your_secret_here
ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

### Running the Application

**Terminal 1: Start Backend**
```bash
cd backendapi
python -m api.backend
```
Backend runs on: `http://127.0.0.1:5000`

**Terminal 2: Start Frontend**
```bash
cd frontend
npm run dev
```
Frontend runs on: `http://localhost:5173` (or next available port)

**Open Browser**
```
http://localhost:5173
```

---

## 📡 API Reference

### Core Endpoints

#### Execute Workflow (Signal Generation)
```http
POST /api/workflows/execute_v2
Content-Type: application/json

{
  "symbol": "AAPL",
  "timeframe": "1d",
  "workflow_blocks": [...]
}

Response:
{
  "finalSignal": "BUY",
  "final_decision": "CONFIRMED",
  "last_price": 150.25
}
```

#### Ingest Signal (Trade Engine)
```http
POST /api/signals/ingest
Content-Type: application/json

{
  "strategy_id": "workflow-2025-12-14...",
  "signal": "BUY",
  "price": 150.25,
  "ts": "2025-12-15T21:00:00Z"
}

Response:
{
  "success": true,
  "action": "opened_long" | "closed_short_opened_long" | "no_change"
}
```

#### Get Analytics Overview
```http
GET /api/analytics/overview

Response:
{
  "metrics": {
    "total_trades": 100,
    "wins": 45,
    "losses": 55,
    "win_rate": 45.0,
    "net_return_pct": 12.5,
    "avg_win_pct": 2.39,
    "avg_loss_pct": -0.64,
    "largest_win_pct": 8.5,
    "largest_loss_pct": -3.2,
    "profit_factor": 3.05,
    "expectancy_pct": 0.73,
    "max_drawdown_pct": -6.4
  },
  "computed_at": "2025-12-15T21:30:00Z"
}
```

#### Get Equity Curve
```http
GET /api/analytics/equity-curve

Response:
{
  "equity_curve": [
    {"ts": "2025-12-15T10:00:00Z", "equity_pct": 100.0},
    {"ts": "2025-12-15T10:05:00Z", "equity_pct": 104.85},
    {"ts": "2025-12-15T10:10:00Z", "equity_pct": 107.77}
  ]
}
```

#### Get Trades
```http
GET /api/trades?strategy_id=workflow-123&limit=50

Response:
{
  "trades": [
    {
      "id": "550e8400...",
      "strategy_id": "workflow-...",
      "open_side": "LONG",
      "open_price": 100.0,
      "open_ts": "2025-12-15T21:00:00Z",
      "close_price": 105.0,
      "close_ts": "2025-12-15T21:05:00Z",
      "gross_pct": 5.0,
      "fee_pct_total": 0.15,
      "net_pct": 4.85
    }
  ]
}
```

#### Delete All Trades (Reset)
```http
DELETE /api/trades

Response:
{
  "success": true,
  "deleted_count": 100
}
```

### Dashboard Endpoints

#### Get Current Signals
```http
GET /api/signals/current

Response:
{
  "signals": [
    {
      "strategy_id": "workflow-123",
      "signal": "BUY",
      "price": 150.25,
      "ts": "2025-12-15T21:00:00Z"
    }
  ]
}
```

#### Clear Signals
```http
DELETE /api/signals/current

Response:
{
  "success": true
}
```

---

## 🔄 Continuous Operation Loop

**While strategies are enabled:**

1. Poll backend every 1 second per strategy
2. Generate signals (BUY/SELL/HOLD)
3. De-duplicate identical signals
4. Ingest new signals to trade engine
5. State machine processes signals:
   - Open positions on first signal
   - Close + open on signal change
   - Calculate percent P&L on close
6. Save completed trades
7. Recompute analytics (debounced)
8. Update dashboard/analytics UI
9. **Repeat**

**User can:**
- Toggle strategies on/off
- Clear signals
- Delete strategies
- Export trade logs
- View detailed analytics

---

## 🎓 Example Complete Trade Lifecycle

```
Time  | Signal | Action                    | Position | Price  | Calculation
------|--------|---------------------------|----------|--------|------------------
10:00 | BUY    | Open LONG                 | LONG     | 100.00 | -
10:05 | BUY    | Ignore (duplicate)        | LONG     | 100.50 | -
10:10 | SELL   | Close LONG + Open SHORT   | SHORT    | 105.00 | +5% (gross)
      |        |                           |          |        | +4.85% (net)
10:15 | SELL   | Ignore (duplicate)        | SHORT    | 104.80 | -
10:20 | BUY    | Close SHORT + Open LONG   | LONG     | 102.00 | +2.94% (gross)
      |        |                           |          |        | +2.79% (net)
```

**Total Net Return:** 4.85% + 2.79% = **7.64%**

---

## 📝 Key Design Principles

1. **Percentage-Only** - All P&L in percent (no USD amounts)
2. **Alternating Positions** - LONG↔SHORT only (no HOLD trades recorded)
3. **De-duplication** - Only signal changes trigger actions
4. **State Persistence** - Positions survive restarts
5. **Single Source of Truth** - Trade engine is authoritative
6. **Real-Time Updates** - UI updates on trade completion events
7. **Composable Workflows** - Strategies are data-driven & serializable

---

## 📚 Additional Documentation

- **WORKFLOW_SYSTEM.md** - Sequential workflow engine details
- **PROJECT_STRUCTURE.md** - File organization
- **backendapi/README.md** - Backend-specific docs
- **frontend/README_FIREBASE.md** - Firebase deployment (if used)

---

## 🤝 Contributing

This is a personal trading project. For questions or collaboration, open an issue or contact the maintainer.

---

## ⚠️ Disclaimer

This software is for educational and research purposes only. Do not use with real money without thorough testing and understanding of the risks involved. Trading involves substantial risk of loss.

---

## 📄 License

Private project - All rights reserved.

---

**FlowGrid Trading v1.0**  
*Last Updated: December 15, 2025*

---

## 🎯 Quick Command Reference

```bash
# Start backend
cd backendapi && python -m api.backend

# Start frontend
cd frontend && npm run dev

# Run tests
cd backendapi && pytest

# Export trades
GET /api/trades → save as CSV/JSON

# Clear all data
DELETE /api/trades
DELETE /api/positions
```

---

**Happy Trading! 📈**
