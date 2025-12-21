# FlowGrid Trading Backend API

## Overview

FlowGrid Trading is a percentage-based algorithmic trading platform with a visual strategy builder. The backend provides:

- **Unified Strategy Execution Engine** - Single execution path for both backtesting AND live signals
- **Graph-based Workflow Processing** - Topologically sorts nodes and evaluates indicator logic
- **Multiple Technical Indicators** - RSI, EMA, SMA, MACD, Bollinger Bands, VWAP, Stochastic
- **Logic Gates** - AND, OR, NOT, Compare for complex multi-condition strategies
- **Real-time Data Integration** - Alpaca API for live market data

## Architecture

### Unified Executor (NEW)

Located at `workflows/unified_executor.py`, this is the **SINGLE** execution engine used by:
- `/execute_backtest` - Backtesting endpoint
- `/execute_workflow` - Live signal endpoint

**Principle: Same strategy + Same data = Same result (backtest or live)**

### Key Features

1. **Graph-based Execution**
   - Parses workflow nodes and connections
   - Builds dependency graph from connections
   - Topologically sorts nodes using Kahn's algorithm
   - Executes nodes in correct dependency order

2. **Indicator Calculations**
   - EMA (Exponential Moving Average)
   - SMA (Simple Moving Average)
   - RSI (Relative Strength Index)
   - MACD (Moving Average Convergence Divergence)
   - Bollinger Bands
   - VWAP (Volume Weighted Average Price)
   - Stochastic Oscillator
   - OBV (On-Balance Volume)

3. **Logic Gates**
   - AND - All inputs must be true
   - OR - Any input must be true
   - NOT - Inverts input
   - Compare - Compares two numeric values (>, <, >=, <=, ==, !=)

4. **Signal Direction Inference**
   - RSI oversold → BUY, overbought → SELL
   - EMA bullish crossover → BUY
   - MACD histogram positive → BUY
   - Explicit signal node type takes precedence

## API Endpoints

### POST /execute_backtest
Run a strategy on historical data.

### POST /execute_workflow  
Run a strategy for live signals (1-second polling).

### POST /execute_workflow_v2
Enhanced response format for the Results Panel.

## Deployment

git init
git add .
git commit -m "my comment"
git branch -M main
git remote add origin https://github.com/Neel-Nimbalkar/flowtradebackend.git
git push -u origin main
OR
git push -f origin main

after the code changes: update github and it will trigger render to deploy 
C:\Users\nimba\OneDrive\Desktop\FlowGrid Trading\backendapi>
git add .
git commit -m "some comment"
git branch -M main
git push -f origin main