# FlowGrid Trading - Analytics Calculation Workflow

## Overview

This document explains how analytics and dashboard metrics are calculated when **two different strategies** are running simultaneously in FlowGrid Trading.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SIGNAL GENERATION                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────┐          ┌─────────────────────┐                      │
│   │   Strategy A        │          │   Strategy B        │                      │
│   │   (RSI Crossover)   │          │   (MACD Momentum)   │                      │
│   │                     │          │                     │                      │
│   │   Symbol: NVDA      │          │   Symbol: AAPL      │                      │
│   │   Direction: LONG   │          │   Direction: SHORT  │                      │
│   │   Confidence: 0.85  │          │   Confidence: 0.72  │                      │
│   └─────────┬───────────┘          └──────────┬──────────┘                      │
│             │                                  │                                 │
│             ▼                                  ▼                                 │
│   ┌─────────────────────────────────────────────────────┐                       │
│   │              Signal Ingest Endpoint                  │                       │
│   │         POST /api/signals/ingest                     │                       │
│   │   {strategy_id, symbol, direction, price, ts}        │                       │
│   └────────────────────────┬────────────────────────────┘                       │
│                            │                                                     │
└────────────────────────────┼─────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TRADE ENGINE                                        │
│                        (trade_engine.py)                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │                     ingest_signal() State Machine                      │     │
│   ├───────────────────────────────────────────────────────────────────────┤     │
│   │                                                                        │     │
│   │   1. Lookup existing position by (strategy_id, symbol)                 │     │
│   │   2. If NO position exists AND signal is LONG/SHORT:                   │     │
│   │      → OPEN new position in positions.json                             │     │
│   │   3. If position EXISTS AND signal is OPPOSITE direction:              │     │
│   │      → CLOSE position                                                  │     │
│   │      → Calculate percentage P&L                                        │     │
│   │      → Write trade to percent_trades.json                              │     │
│   │      → Update analytics_cache.json                                     │     │
│   │   4. Strategy A signals CANNOT close Strategy B positions              │     │
│   │      (strategy_id isolation)                                           │     │
│   │                                                                        │     │
│   └───────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │                     POSITION STATE MACHINE                             │     │
│   │                                                                        │     │
│   │   FLAT ──[LONG signal]──> LONG ──[SHORT signal]──> FLAT (trade closed) │     │
│   │   FLAT ──[SHORT signal]─> SHORT ─[LONG signal]──> FLAT (trade closed)  │     │
│   │                                                                        │     │
│   │   Each (strategy_id, symbol) pair has independent state                │     │
│   └───────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │              Percentage P&L Calculation                                │     │
│   │                                                                        │     │
│   │   LONG trade:                                                          │     │
│   │     gross_pct = ((exit_price - entry_price) / entry_price) × 100      │     │
│   │                                                                        │     │
│   │   SHORT trade:                                                         │     │
│   │     gross_pct = ((entry_price - exit_price) / entry_price) × 100      │     │
│   │                                                                        │     │
│   │   Net P&L: net_pct = gross_pct - fee_pct (default 0.1%)               │     │
│   └───────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              DATA STORAGE                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────┐    ┌─────────────────────────┐                    │
│   │    positions.json       │    │   percent_trades.json   │                    │
│   │    (Open Positions)     │    │    (Completed Trades)   │                    │
│   │                         │    │                         │                    │
│   │  {                      │    │  [                      │                    │
│   │    "strategy_a::NVDA":  │    │    {                    │                    │
│   │      {                  │    │      trade_id: "uuid",  │                    │
│   │        strategy_id,     │    │      strategy_id,       │                    │
│   │        symbol,          │    │      symbol,            │                    │
│   │        side: "LONG",    │    │      open_side,         │                    │
│   │        entry_price,     │    │      entry_price,       │                    │
│   │        open_ts          │    │      exit_price,        │                    │
│   │      }                  │    │      gross_pct,         │                    │
│   │  }                      │    │      net_pct,           │                    │
│   │                         │    │      open_ts,           │                    │
│   │                         │    │      close_ts           │                    │
│   │                         │    │    }, ...               │                    │
│   │                         │    │  ]                      │                    │
│   └─────────────────────────┘    └────────────┬────────────┘                    │
│                                               │                                 │
└───────────────────────────────────────────────┼─────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ANALYTICS COMPUTATION                                  │
│                          compute_analytics()                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐       │
│   │                    AGGREGATE METRICS (All Strategies)                │       │
│   │                                                                      │       │
│   │   trade_count     = total trades from both strategies               │       │
│   │   wins            = trades where net_pct > 0                        │       │
│   │   losses          = trades where net_pct < 0                        │       │
│   │   win_rate        = (wins / trade_count) × 100                      │       │
│   │   gross_return_pct = Σ(all gross_pct)                               │       │
│   │   net_return_pct   = Σ(all net_pct)                                 │       │
│   │   profit_factor   = Σ(winning net_pct) / |Σ(losing net_pct)|        │       │
│   │   expectancy      = (win_rate × avg_win) - (loss_rate × |avg_loss|) │       │
│   │   max_drawdown    = largest peak-to-trough in equity curve          │       │
│   └─────────────────────────────────────────────────────────────────────┘       │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐       │
│   │                    BY-STRATEGY METRICS (Isolated)                    │       │
│   │                                                                      │       │
│   │   ┌──────────────────────┐    ┌──────────────────────┐              │       │
│   │   │   Strategy A         │    │   Strategy B         │              │       │
│   │   │   trade_count: 5     │    │   trade_count: 3     │              │       │
│   │   │   wins: 4            │    │   wins: 2            │              │       │
│   │   │   losses: 1          │    │   losses: 1          │              │       │
│   │   │   win_rate: 80%      │    │   win_rate: 66.7%    │              │       │
│   │   │   net_return: +4.2%  │    │   net_return: +1.8%  │              │       │
│   │   └──────────────────────┘    └──────────────────────┘              │       │
│   └─────────────────────────────────────────────────────────────────────┘       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           API ENDPOINTS                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   GET /api/analytics/overview                                                    │
│   └─> { metrics: {...}, by_strategy: {...} }                                    │
│                                                                                  │
│   GET /api/analytics/equity-curve                                               │
│   └─> [ { ts, equity_pct, drawdown_pct }, ... ]                                 │
│       Cumulative equity built chronologically from all trades                    │
│                                                                                  │
│   GET /api/analytics/distributions                                              │
│   └─> { histogram: [...], stats: { mean, std } }                                │
│       P&L distribution across all strategies                                     │
│                                                                                  │
│   GET /api/analytics/heatmap                                                    │
│   └─> { by_day: [...], by_hour: [...] }                                         │
│       When do trades happen and how profitable by time                           │
│                                                                                  │
│   GET /api/trades?limit=100                                                     │
│   └─> [ { trade_id, strategy_id, symbol, net_pct, ... }, ... ]                  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Dashboard & Analytics)                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐       │
│   │                      tradeService.js                                 │       │
│   │                                                                      │       │
│   │   getDashboardDataAsync()                                            │       │
│   │   ├── fetchAnalyticsFromBackend()                                    │       │
│   │   ├── fetchEquityCurveFromBackend()                                  │       │
│   │   ├── fetchHeatmapFromBackend()                                      │       │
│   │   └── fetchTradesFromBackend()                                       │       │
│   │                                                                      │       │
│   │   Falls back to localStorage if backend unavailable                  │       │
│   └─────────────────────────────────────────────────────────────────────┘       │
│                                                                                  │
│   ┌──────────────────────────────┐    ┌──────────────────────────────┐          │
│   │        Dashboard.jsx         │    │      AnalyticsPage.jsx       │          │
│   │                              │    │                              │          │
│   │  ┌────────────────────────┐  │    │  ┌────────────────────────┐  │          │
│   │  │  Net P&L: +6.0%        │  │    │  │  Overview Tab          │  │          │
│   │  │  (Strategy A + B)      │  │    │  │  - KPIs from all trades│  │          │
│   │  └────────────────────────┘  │    │  └────────────────────────┘  │          │
│   │                              │    │                              │          │
│   │  ┌────────────────────────┐  │    │  ┌────────────────────────┐  │          │
│   │  │  Win Rate: 75%         │  │    │  │  Strategy Attribution  │  │          │
│   │  │  (6 wins / 8 trades)   │  │    │  │  - Strategy A: +4.2%   │  │          │
│   │  └────────────────────────┘  │    │  │  - Strategy B: +1.8%   │  │          │
│   │                              │    │  └────────────────────────┘  │          │
│   │  ┌────────────────────────┐  │    │                              │          │
│   │  │  Equity Curve Chart    │  │    │  ┌────────────────────────┐  │          │
│   │  │  (Combined portfolio)  │  │    │  │  Trade Logging         │  │          │
│   │  └────────────────────────┘  │    │  │  - All trades list     │  │          │
│   │                              │    │  │  - Filterable by strat │  │          │
│   │  ┌────────────────────────┐  │    │  └────────────────────────┘  │          │
│   │  │  Strategy Panel        │  │    │                              │          │
│   │  │  - Enable/Disable      │  │    │  ┌────────────────────────┐  │          │
│   │  │  - Per-strategy P&L    │  │    │  │  Time Analysis         │  │          │
│   │  └────────────────────────┘  │    │  │  - P&L by day/hour     │  │          │
│   │                              │    │  └────────────────────────┘  │          │
│   └──────────────────────────────┘    └──────────────────────────────┘          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Example: Two Strategies Running

### Scenario Setup

| Strategy | Symbol | First Signal | Entry Price |
|----------|--------|--------------|-------------|
| RSI_Cross (A) | NVDA | LONG | $140.00 |
| MACD_Mom (B) | AAPL | SHORT | $180.00 |

### Signal Timeline

```
T1: Strategy A sends LONG signal for NVDA at $140.00
    → positions.json: { "RSI_Cross::NVDA": { side: "LONG", entry: 140.00 } }

T2: Strategy B sends SHORT signal for AAPL at $180.00  
    → positions.json adds: { "MACD_Mom::AAPL": { side: "SHORT", entry: 180.00 } }

T3: Strategy A sends SHORT signal for NVDA at $145.00
    → Position RSI_Cross::NVDA CLOSES
    → gross_pct = ((145 - 140) / 140) × 100 = +3.57%
    → net_pct = 3.57 - 0.10 = +3.47%
    → Trade written to percent_trades.json
    → positions.json removes RSI_Cross::NVDA

T4: Strategy B sends LONG signal for AAPL at $175.00
    → Position MACD_Mom::AAPL CLOSES  
    → gross_pct = ((180 - 175) / 180) × 100 = +2.78% (short math)
    → net_pct = 2.78 - 0.10 = +2.68%
    → Trade written to percent_trades.json
```

### Resulting Analytics

```json
{
  "metrics": {
    "trade_count": 2,
    "wins": 2,
    "losses": 0,
    "win_rate": 100.0,
    "net_return_pct": 6.15,
    "profit_factor": "inf"
  },
  "by_strategy": {
    "RSI_Cross": {
      "trade_count": 1,
      "wins": 1,
      "net_return_pct": 3.47
    },
    "MACD_Mom": {
      "trade_count": 1, 
      "wins": 1,
      "net_return_pct": 2.68
    }
  }
}
```

---

## Key Design Principles

### 1. Strategy Independence
- Each strategy operates on its own positions
- `RSI_Cross::NVDA` is completely separate from `MACD_Mom::NVDA`
- Strategy A's signals cannot accidentally close Strategy B's positions

### 2. Percentage-Based P&L
- All returns are expressed as percentages
- No need to track dollar amounts or position sizes
- Easy to compare strategies regardless of capital allocation

### 3. Alternating LONG↔SHORT
- Positions can only be LONG or SHORT (or FLAT)
- A LONG signal on a SHORT position closes it
- No "double-down" or "scale-in" logic (can be added later)

### 4. Combined Portfolio View
- Dashboard shows aggregate metrics across ALL strategies
- Equity curve represents combined portfolio performance
- Individual strategy performance available in Attribution tab

---

## Data Flow Summary

```
Signal Generated → Trade Engine (ingest_signal)
                      ↓
              Position State Machine
              (Open/Close based on direction)
                      ↓
              Calculate % P&L on close
                      ↓
              Write to percent_trades.json
                      ↓
              compute_analytics() aggregates
                      ↓
              API serves to frontend
                      ↓
              Dashboard/Analytics display
```
