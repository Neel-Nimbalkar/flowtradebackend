# FlowGrid Trading - Project Structure

## Overview
FlowGrid Trading is a comprehensive trading strategy platform with visual workflow builder, backtesting engine, and real-time analytics.

## Clean Project Structure

```
FlowGrid Trading/
├── backendapi/                 # Backend API & Services (ALL BACKEND CODE HERE)
│   ├── api/                    # API endpoints & WebSocket server
│   │   ├── backend.py         # Main Flask API server (ACTIVE)
│   │   ├── trade_engine.py    # Trade execution engine
│   │   ├── analytics_api.py   # Analytics endpoints
│   │   ├── dashboard_api.py   # Dashboard endpoints
│   │   └── flowgrid_ws.py     # WebSocket server for real-time updates
│   │
│   ├── workflows/              # Workflow engine & orchestration
│   │   ├── workflow_engine.py         # Core workflow engine
│   │   ├── unified_executor.py        # Graph-based unified executor
│   │   ├── flowgrid_nodes.py          # Node definitions
│   │   ├── flowgrid_orchestrator.py   # Workflow orchestrator
│   │   ├── flowgrid_realtime.py       # Real-time workflow execution
│   │   ├── graph_executor.py          # Graph execution logic
│   │   └── run_workflow*.py           # Workflow runners
│   │
│   ├── indicators/             # Technical indicators
│   │   ├── bollingerBands.py
│   │   ├── macdIndicator.py
│   │   ├── rsiIndicator.py
│   │   └── ...
│   │
│   ├── backtest/               # Backtesting engine
│   │   ├── backtest_core.py        # Core backtesting logic
│   │   ├── backtest_manager.py     # Backtest management
│   │   └── smoke_test_backtest.py  # Backtest smoke tests
│   │
│   ├── integrations/           # External service integrations
│   │   ├── alpaca_fetch.py         # Alpaca API integration
│   │   ├── telegram_notifier.py    # Telegram notifications
│   │   └── TELEGRAM_SETUP.md       # Telegram setup guide
│   │
│   ├── tests/                  # All backend tests
│   │   ├── test_unified_executor.py
│   │   ├── test_trade_engine.py
│   │   ├── test_indicators.py
│   │   ├── test_integration.py
│   │   └── ...
│   │
│   ├── utils/                  # Utility scripts & helpers
│   │   ├── strategy_cli.py
│   │   ├── visualize.py
│   │   └── ...
│   │
│   ├── data/                   # Data storage (positions, trades, cache)
│   ├── requirements.txt        # Python dependencies
│   ├── pytest.ini             # Pytest configuration
│   └── WORKFLOW_SYSTEM.md     # Workflow system documentation
│
├── frontend/                   # React frontend application
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── Backtest/     # Backtesting UI components
│   │   │   ├── ResultsPanel/ # Strategy results display
│   │   │   └── ...
│   │   ├── pages/            # Page components
│   │   │   ├── Dashboard.jsx
│   │   │   └── ...
│   │   ├── services/         # API services
│   │   ├── utils/            # Utility functions
│   │   └── main.jsx          # App entry point
│   ├── public/               # Static assets
│   ├── package.json         # Node.js dependencies
│   └── vite.config.js       # Vite configuration
│
├── docs/                       # Documentation
│   └── ANALYTICS_WORKFLOW.md
│
├── outputs/                    # Backtest results & output files
│   └── backtests/
│
├── archive/                    # Archived/deprecated code
│   └── cleanup_*/             # Timestamped cleanup archives
│
├── .venv/                      # Python virtual environment
├── .github/                    # GitHub workflows & configs
│   └── copilot-instructions.md
├── .gitignore                 # Git ignore rules
├── Procfile                   # Heroku deployment config
├── README.md                  # Project README
└── PROJECT_STRUCTURE.md       # This file
```

## Getting Started

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backendapi
   ```

2. Create/activate virtual environment:
   ```bash
   # Windows
   ..\.venv\Scripts\Activate.ps1
   
   # Linux/Mac
   source ../.venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the API server:
   ```bash
   python -m api.backend
   ```

### Frontend Setup

1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

## Key Features

- **Visual Workflow Builder**: Drag-and-drop interface for creating trading strategies
- **Backtesting Engine**: TradingView-style backtesting with realistic fills
- **Advanced Analytics**: Performance metrics, risk analysis, monthly returns heatmap
- **Real-time Execution**: Live strategy execution with WebSocket updates
- **Multiple Integrations**: Alpaca API, Telegram notifications
- **Technical Indicators**: RSI, MACD, Bollinger Bands, ATR, EMA, SMA, VWAP, and more

## Architecture

### Backend (`backendapi/`)
- **API Layer**: Flask REST API with WebSocket support
- **Workflow Engine**: Node-based visual programming with graph-based execution
- **Unified Executor**: Kahn's algorithm for topological execution order
- **Backtest Engine**: Historical data simulation with percentage-based P&L
- **Indicators**: Modular technical indicator implementations
- **Integrations**: External service connectors (Alpaca, Telegram)

### Frontend (`frontend/`)
- **React 18**: Modern component-based UI
- **Vite**: Fast build tool and dev server
- **Real-time Updates**: WebSocket integration for live data
- **Results Panel**: Strategy execution results display

## Development Workflow

1. **Backend Changes**: Edit files in `backendapi/` and restart Flask server
2. **Frontend Changes**: Edit files in `frontend/src/` - Vite hot-reloads automatically
3. **Testing**: Run `pytest` from `backendapi/` directory

## Ports

- Backend API: `http://localhost:5000`
- Frontend Dev Server: `http://localhost:5173`
- WebSocket Server: `ws://localhost:6789`

## Recent Changes (Dec 2024)

- Fixed AND/OR gate signal propagation using unified executor
- Added topological sorting for correct node execution order
- Enhanced Results Panel to show actual indicator values
- Cleaned up duplicate files and consolidated backend into `backendapi/`
