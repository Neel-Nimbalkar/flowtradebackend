# FlowGrid Trading - Project Structure

## Overview
FlowGrid Trading is a comprehensive trading strategy platform with visual workflow builder, backtesting engine, and real-time analytics.

## Project Structure

```
FlowGrid Trading/
├── backendapi/                 # Backend API & Services
│   ├── api/                    # API endpoints & WebSocket server
│   │   ├── backend.py         # Main Flask API server
│   │   └── flowgrid_ws.py     # WebSocket server for real-time updates
│   │
│   ├── indicators/             # Technical indicators
│   │   ├── bollingerBands.py
│   │   ├── macdIndicator.py
│   │   └── rsiIndicator.py
│   │
│   ├── workflows/              # Workflow engine & orchestration
│   │   ├── flowgrid_nodes.py          # Node definitions
│   │   ├── flowgrid_orchestrator.py   # Workflow orchestrator
│   │   ├── flowgrid_realtime.py       # Real-time workflow execution
│   │   ├── workflow_engine.py         # Core workflow engine
│   │   ├── run_workflow.py            # Workflow runner
│   │   └── run_workflow_current.py    # Current workflow runner
│   │
│   ├── backtest/               # Backtesting engine
│   │   ├── backtest_core.py        # Core backtesting logic
│   │   ├── backtest_manager.py     # Backtest management
│   │   └── smoke_test_backtest.py  # Backtest smoke tests
│   │
│   ├── integrations/           # External service integrations
│   │   ├── alpaca_fetch.py         # Alpaca API integration
│   │   ├── telegram_notifier.py    # Telegram notifications
│   │   ├── telegram_settings.json  # Telegram config
│   │   └── TELEGRAM_SETUP.md       # Telegram setup guide
│   │
│   ├── utils/                  # Utility scripts & helpers
│   │   ├── analyze_execute_local.py
│   │   ├── analyze_rsi_client.py
│   │   ├── demo_realtime.py
│   │   ├── strategy_cli.py
│   │   ├── visualize.py
│   │   ├── debug_infer_direction.py
│   │   ├── debug_rsi_run.py
│   │   ├── reconstruct_and_test.py
│   │   ├── test_chart_endpoint.py
│   │   ├── test_current_price.py
│   │   ├── test_price_history.py
│   │   └── last_response.json
│   │
│   ├── core/                   # Core business logic (future use)
│   │
│   ├── requirements.txt        # Python dependencies
│   ├── pytest.ini             # Pytest configuration
│   └── WORKFLOW_SYSTEM.md     # Workflow system documentation
│
├── frontend/                   # React frontend application
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── Backtest/     # Backtesting UI components
│   │   │   ├── DashboardSidebar.jsx
│   │   │   └── Icon.jsx
│   │   ├── pages/            # Page components
│   │   │   ├── BacktestPage.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── Analytics.jsx
│   │   ├── backtestEngine.js # Client-side backtest engine
│   │   └── ...
│   ├── public/               # Static assets
│   ├── package.json         # Node.js dependencies
│   └── vite.config.js       # Vite configuration
│
├── types/                      # TypeScript type definitions
│   ├── alpaca.ts
│   ├── atr.ts
│   ├── bollingerBands.ts
│   ├── compareLogic.ts
│   ├── ema.ts
│   ├── engine.ts
│   ├── macdIndicator.ts
│   ├── obv.ts
│   ├── rsiIndicator.ts
│   ├── stochastic.ts
│   ├── volumeSpike.ts
│   ├── vwap.ts
│   └── types.ts
│
├── tests/                      # Test files
│   ├── test_backend_indicators.py
│   ├── test_indicators.py
│   ├── test_mapping.py
│   ├── test_realtime_integration.py
│   ├── test_rsi_repro.py
│   ├── test_volume_trend.py
│   └── debug_backtest_core.py
│
├── scripts/                    # Utility scripts & examples
│   ├── nvda_combined_report.py
│   ├── nvda_price_rsi_chart.py
│   ├── nvda_week_table.py
│   ├── test_gemini.py
│   ├── test_openai.py
│   ├── test_tradingview_nvda.py
│   └── verify_no_yahoo.py
│
├── outputs/                    # Backtest results & output files
│   └── backtests/
│
├── backend/                    # Legacy backend (Java/Python)
│   ├── java/
│   └── python/
│
├── archive/                    # Archived/deprecated code
│
├── flowtrade/                  # Additional trading modules
│
├── .venv/                      # Python virtual environment
├── .github/                    # GitHub workflows & configs
├── .gitignore                  # Git ignore rules
├── package.json               # Root Node.js config
└── PROJECT_STRUCTURE.md       # This file
```

## Getting Started

### Backend Setup

1. Navigate to backend directory:
   ```bash
   cd backendapi
   ```

2. Create virtual environment:
   ```bash
   python -m venv ../.venv
   ```

3. Activate virtual environment:
   ```bash
   # Windows
   ..\.venv\Scripts\Activate.ps1
   
   # Linux/Mac
   source ../.venv/bin/activate
   ```

4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Run the API server:
   ```bash
   cd ..
   python -m backendapi.api.backend
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
- **Technical Indicators**: RSI, MACD, Bollinger Bands, ATR, and more

## Architecture

### Backend (`backendapi/`)
- **API Layer**: Flask REST API with WebSocket support
- **Workflow Engine**: Node-based visual programming engine
- **Backtest Engine**: Historical data simulation with percentage-based position sizing
- **Indicators**: Modular technical indicator implementations
- **Integrations**: External service connectors (Alpaca, Telegram)

### Frontend (`frontend/`)
- **React 18**: Modern component-based UI
- **Vite**: Fast build tool and dev server
- **Client-side Backtesting**: In-browser backtest execution
- **Real-time Updates**: WebSocket integration for live data
- **Responsive Design**: Mobile-friendly interface

## Development Workflow

1. **Backend Changes**: Edit files in `backendapi/` and restart Flask server
2. **Frontend Changes**: Edit files in `frontend/src/` - Vite hot-reloads automatically
3. **Testing**: Run tests from `tests/` directory using pytest
4. **Type Definitions**: Update TypeScript types in `types/` as needed

## Notes

- Backend API runs on `http://localhost:5000` by default
- Frontend dev server runs on `http://localhost:5173` by default
- WebSocket server runs on `ws://localhost:6789` by default
- All Python dependencies should be added to `backendapi/requirements.txt`
- All npm dependencies should be added to `frontend/package.json`
