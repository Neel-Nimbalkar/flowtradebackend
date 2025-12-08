# FlowGrid Trading - Sequential Workflow System

## Overview
Sequential workflow execution engine for retail traders. Blocks are evaluated top-to-bottom, stopping on the first failed condition.

## Architecture

### Backend Components

**`workflow_engine.py`** - Core execution engine
- `WorkflowEngine`: Sequential block processor
- `ConditionEvaluator`: Modular condition checkers for each indicator
- `BlockResult`: Per-block execution state
- `WorkflowResult`: Complete workflow outcome

**`backend.py`** - Flask API
- `/execute`: Original parallel indicator execution
- `/execute_workflow`: New sequential workflow endpoint
- `/health`: Server status check

### Frontend Components

**`workflow_builder.html`** - Visual workflow designer
- Drag-and-drop block canvas
- Connection wiring
- Execution visualization
- Results panel

**`workflow_runner.js`** - Workflow execution client
- `runSequentialWorkflow()`: Orchestrates workflow execution
- `animateWorkflowExecution()`: Live block-by-block animation
- `displayWorkflowResults()`: Formatted result rendering

## Sequential Execution Logic

```
Block 1 → Evaluate → PASS → Block 2 → Evaluate → PASS → Block 3 → ...
                    ↓ FAIL
                    STOP (remaining blocks marked SKIPPED)
```

### Block States
- `PENDING`: Not yet evaluated
- `RUNNING`: Currently evaluating
- `PASSED`: Condition met (green border)
- `FAILED`: Condition not met (red border, stops workflow)
- `SKIPPED`: Not evaluated due to previous failure (grayed out)

## Supported Conditions

### Indicator Blocks
- **RSI**: Oversold (<30) or overbought (>70)
- **EMA/SMA**: Price above/below moving average
- **MACD**: Positive/negative histogram
- **Bollinger Bands**: Touch upper/lower, or outside bands
- **Trendline**: Bullish/bearish breakout detection
- **Stochastic**: Oversold (<20) or overbought (>80)
- **Volume Spike**: Detected or not

### Price Blocks
- **Price Above**: `close > threshold`
- **Price Below**: `close < threshold`

### Logic Blocks (Future)
- **AND Gate**: All inputs must pass
- **OR Gate**: Any input must pass
- **NOT Gate**: Invert condition

## API Usage

### Execute Workflow
```http
POST /execute_workflow
Content-Type: application/json

{
  "symbol": "SPY",
  "timeframe": "1Hour",
  "days": 7,
  "workflow": [
    {
      "id": 1,
      "type": "rsi",
      "params": {"threshold_low": 30, "threshold_high": 70}
    },
    {
      "id": 2,
      "type": "volume_spike",
      "params": {}
    },
    {
      "id": 3,
      "type": "macd",
      "params": {"direction": "positive"}
    }
  ],
  "indicator_params": {
    "rsi": {"period": 14},
    "macd": {"fast": 12, "slow": 26, "signal": 9}
  }
}
```

### Response Format
```json
{
  "success": true,
  "final_decision": "CONFIRMED",
  "stop_reason": null,
  "execution_time_ms": 125.3,
  "blocks": [
    {
      "block_id": 1,
      "block_type": "rsi",
      "status": "passed",
      "message": "RSI 28.5 < 30 (oversold)",
      "data": {"condition_met": true},
      "execution_time_ms": 12.5
    },
    {
      "block_id": 2,
      "block_type": "volspike",
      "status": "failed",
      "message": "No volume spike detected",
      "data": {"condition_met": false},
      "execution_time_ms": 8.2
    },
    {
      "block_id": 3,
      "block_type": "macd",
      "status": "skipped",
      "message": "Skipped due to previous block failure",
      "data": {},
      "execution_time_ms": 0
    }
  ],
  "latest_data": {
    "close": 672.95,
    "rsi": 28.5,
    "vol_spike": false
  }
}
```

## UI Features

### Execution Animation
- Blocks pulse green while evaluating
- Pass: Green border persists
- Fail: Red border + execution stops
- Skipped: Grayed out

### Results Panel
- Overall decision (CONFIRMED/REJECTED)
- Stop reason if failed
- Block-by-block timeline
- Execution time per block
- Market data snapshot

## Optimization Strategies

### Performance
- Parallel indicator computation (pre-execution)
- Lazy evaluation (compute only needed indicators)
- Caching market data for repeated runs
- WebSocket for real-time updates

### Scalability
- Database storage for workflow templates
- User accounts and saved strategies
- Backtesting integration
- Paper trading mode

### UX Improvements
- Drag reordering of blocks
- Condition builder UI (dropdowns vs. manual params)
- Visual condition preview before run
- Historical execution log
- A/B testing multiple strategies

## Future Enhancements

### Pattern Detection
- Candlestick patterns (engulfing, doji, hammer)
- Chart patterns (head & shoulders, triangles)
- Support/resistance levels

### Advanced Logic
- Multi-timeframe analysis
- Correlated asset checks
- News sentiment integration
- Options flow data

### Execution Actions
- Auto-place orders on CONFIRMED
- Position sizing based on risk rules
- Stop-loss / take-profit automation
- Alert notifications (email/SMS/webhook)

## Testing

### Manual Test
1. Open http://localhost:8000/workflow_builder.html
2. Drag blocks: Symbol → Timeframe → Lookback → Input → RSI → Signal
3. Click "🔄 Run Workflow"
4. Observe sequential animation
5. Check results panel for pass/fail states

### Unit Tests (Future)
```bash
pytest workflow_engine.py
pytest test_conditions.py
```

## Data Source
- **Alpaca Markets API** (IEX feed)
- No Yahoo Finance or scraped data
- Real-time bars via `alpaca_fetch.py`

## Configuration
- Timeframes: 1Min, 5Min, 15Min, 1Hour, 1Day
- Lookback: 1-200 days
- Customizable indicator periods via settings panel

## Dependencies
```
flask
flask-cors
alpaca-trade-api
```

Install: `pip install -r requirements.txt`

## Run
```bash
# Terminal 1: Backend (from project root)
python -m backendapi.api.backend

# Terminal 2: Frontend
cd frontend
npm run dev

# Open browser
http://localhost:5173
```

---

**Key Design Principle**: Every block is a testable, composable condition. Workflows are data-driven and fully serializable for storage, version control, and backtesting.
