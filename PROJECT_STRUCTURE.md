# FlowGrid Trading - Project Structure

## Overview
FlowGrid Trading is a comprehensive trading strategy platform with visual workflow builder, backtesting engine, and real-time analytics.

## Repository Structure

This project is split across two deployments:
- **Frontend**: Firebase Hosting (`frontend/` → https://flowtrade210.web.app)
- **Backend**: Render/Heroku (`backendapi/` → flowtradebackend repo)

## Project Structure

```
FlowGrid Trading/
├── backendapi/                 # Backend API & Services (→ flowtradebackend repo)
│   ├── api/                    # API endpoints
│   │   ├── backend.py         # Main Flask API server
│   │   ├── analytics_api.py   # Analytics endpoints
│   │   ├── dashboard_api.py   # Dashboard endpoints
│   │   ├── flowgrid_ws.py     # WebSocket server
│   │   └── trade_engine.py    # Trade engine
│   │
│   ├── workflows/              # Workflow engine & orchestration
│   │   ├── unified_executor.py        # Graph-based workflow executor
│   │   ├── workflow_engine.py         # Sequential workflow engine
│   │   ├── flowgrid_nodes.py          # Node definitions
│   │   ├── flowgrid_orchestrator.py   # Workflow orchestrator
│   │   └── flowgrid_realtime.py       # Real-time workflow execution
│   │
│   ├── indicators/             # Technical indicators
│   │   ├── bollingerBands.py
│   │   ├── macdIndicator.py
│   │   ├── rsiIndicator.py
│   │   └── ...
│   │
│   ├── backtest/               # Backtesting engine
│   │   ├── backtest_core.py        # Core backtesting logic
│   │   └── backtest_manager.py     # Backtest management
│   │
│   ├── integrations/           # External service integrations
│   │   ├── alpaca_fetch.py         # Alpaca API integration
│   │   └── telegram_notifier.py    # Telegram notifications
│   │
│   ├── data/                   # Data persistence
│   │   ├── positions.json          # Open positions
│   │   └── percent_trades.json     # Completed trades
│   │
│   ├── docs/                   # Documentation
│   │   ├── ANALYTICS_IMPLEMENTATION.md
│   │   └── ANALYTICS_WORKFLOW.md
│   │
│   ├── outputs/                # Backtest outputs
│   │
│   ├── tests/                  # Backend tests
│   │   └── test_*.py
│   │
│   ├── utils/                  # Utility scripts
│   │
│   ├── Procfile               # Heroku/Render deployment
│   ├── requirements.txt       # Python dependencies
│   └── README.md              # Backend documentation
│
├── frontend/                   # React frontend (→ Firebase)
│   ├── src/
│   │   ├── components/        # React components
│   │   │   └── Backtest/      # Backtesting UI components
│   │   ├── pages/             # Page components
│   │   │   ├── Dashboard.jsx
│   │   │   ├── WorkflowBuilder.jsx
│   │   │   └── analytics/
│   │   │       ├── TradeLogging.jsx
│   │   │       └── TradeCalendar.jsx
│   │   └── services/          # Frontend services
│   │       └── StrategyRunner.js  # Strategy polling service
│   ├── dist/                  # Production build
│   ├── firebase.json          # Firebase config
│   └── package.json           # Node.js dependencies
│
├── .github/                    # GitHub config
│   └── copilot-instructions.md
│
├── archive/                    # Archived/legacy files
│
├── PROJECT_STRUCTURE.md        # This file
└── README.md                   # Main project documentation
```

## Deployment

### Backend (flowtradebackend)
```bash
cd backendapi
python -m api.backend
```
- Deployed to: Render/Heroku
- Repository: https://github.com/Neel-Nimbalkar/flowtradebackend

### Frontend (Firebase)
```bash
cd frontend
npm run dev        # Development
npm run build      # Production build
firebase deploy    # Deploy to Firebase
```
- Hosted at: https://flowtrade210.web.app
- Repository: Part of main FlowGrid-Trading repo

## Key Components

### Workflow Engines
- **Unified Executor** (`unified_executor.py`): Graph-based execution with topological sort (Kahn's algorithm)
- **Sequential Engine** (`workflow_engine.py`): Linear execution for backtesting

### Analytics
- Percentage-based P&L (no USD amounts)
- Win rate, profit factor, expectancy, max drawdown
- Trade calendar heatmap

### Data Flow
```
Frontend (React) 
    → POST /api/workflows/execute_v2
    → Backend (Flask)
    → Unified Executor (graph processing)
    → Response with signals
    → StrategyRunner (1-second polling)
    → Trade Engine (state machine)
    → Analytics
```
