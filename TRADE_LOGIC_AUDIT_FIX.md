# Trade Calculation Logic Audit & Fix Report

## Date: December 29, 2025

## Summary

This audit addressed the critical issue where trades were being generated when no strategies were actively enabled. The root causes were identified and fixed.

---

## Problems Identified

### 1. **Global Position State (Frontend)**
- **Location**: `frontend/src/tradeTracker.js`
- **Issue**: Single global position (`flowgrid_live_position_v1`) was shared across ALL strategies
- **Impact**: Signal from Strategy A could close a position opened by Strategy B

### 2. **Trade Tracking in WorkflowBuilder (Frontend)**
- **Location**: `frontend/src/WorkflowBuilder.jsx`
- **Issue**: `trackTrade()` was called during "live" polling mode regardless of whether a strategy was formally enabled
- **Impact**: Testing/preview in the builder created real trades

### 3. **Sample Trade Generation (Backend)**
- **Location**: `backendapi/backendapi/api/backend.py`
- **Issue**: `_generate_sample_trades()` generated 83 fake trades for "demo purposes"
- **Impact**: Analytics showed fake data mixed with real trades

### 4. **Random Signal Generation (Backend)**
- **Location**: `backendapi/backendapi/api/backend.py`
- **Issue**: `_generate_live_signal()` generated random BUY/SELL signals (5% chance per poll)
- **Impact**: Phantom trades created from random signals, not real strategy execution

---

## Fixes Applied

### Fix 1: Strategy-Isolated Positions (tradeTracker.js)

**Before**: Single global position shared by all strategies
**After**: Positions stored per-strategy in `flowgrid_positions_by_strategy_v1`

```javascript
// NEW: Get position for THIS strategy only
export function getPositionForStrategy(strategyId) {
  if (!strategyId) return null;
  const positions = getAllPositionsByStrategy();
  return positions[strategyId] || null;
}

// NEW: Save position for THIS strategy only  
function savePositionForStrategy(strategyId, position) {
  const positions = getAllPositionsByStrategy();
  if (position === null) {
    delete positions[strategyId];
  } else {
    positions[strategyId] = position;
  }
  saveAllPositionsByStrategy(positions);
}
```

### Fix 2: Strategy-Enabled Check in trackTrade()

**Before**: Accepted any trade without checking if strategy was enabled
**After**: Verifies strategy is enabled/running before tracking

```javascript
export function trackTrade(result, config) {
  const strategyId = config.strategyId;
  
  // CRITICAL CHECK: Only track trades for enabled strategies
  if (!strategyId) {
    console.warn('[TradeTracker] No strategyId provided - trade not tracked');
    return null;
  }
  
  // Check if this strategy is enabled/running
  const enabledStrategies = getEnabledStrategies();
  const running = isStrategyRunning(strategyId);
  const enabled = enabledStrategies[strategyId];
  
  if (!enabled && !running) {
    console.log(`[TradeTracker] Strategy "${strategyId}" is not enabled - trade not tracked`);
    return null;
  }
  // ... rest of trade tracking
}
```

### Fix 3: Removed Trade Tracking from WorkflowBuilder Live Mode

**Before**: WorkflowBuilder called `trackTrade()` on every poll
**After**: Trade tracking comment explaining proper usage

```javascript
// NOTE: Trade tracking is handled by StrategyRunner for ENABLED strategies only.
// WorkflowBuilder live mode is for testing/preview and should NOT create trades.
// This prevents "phantom trades" when no strategy is formally enabled.
// 
// To track trades: Save the strategy, then enable it via the Dashboard toggle.
// The StrategyRunner will then poll and track trades correctly.
```

### Fix 4: Disabled Sample Trade Generation (Backend)

**Before**: Generated 83 fake trades on first call
**After**: Returns empty list with deprecation warning

```python
def _generate_sample_trades():
    """
    DEPRECATED: Sample trade generation disabled.
    Real trades are now ONLY created through signal ingestion.
    """
    logger.warning("[DEPRECATED] _generate_sample_trades called - returning empty list")
    return []
```

### Fix 5: Disabled Random Signal Generation (Backend)

**Before**: Generated random BUY/SELL signals in background thread
**After**: Background monitoring disabled with explanatory comment

```python
def _start_realtime_monitoring():
    """
    DISABLED: Background monitoring is now handled by frontend StrategyRunner.
    This server-side monitoring is disabled to prevent:
    1. Random signal generation that pollutes real trade data
    2. Duplicate signal processing (frontend + backend)
    3. Race conditions between frontend and backend polling
    """
    logger.info("[DISABLED] Backend realtime monitoring disabled")
    return
```

---

## Correct Signal Flow (After Fix)

```
1. User creates strategy in WorkflowBuilder
   └── Saves to localStorage (flowgrid_workflow_v1::saves)

2. User toggles strategy ON in Dashboard
   └── Dashboard calls StrategyRunner.toggleStrategy(name, true)
   └── StrategyRunner.startStrategy() begins polling loop

3. StrategyRunner polls /execute_workflow_v2 every 1 second
   └── Backend executes workflow with real market data
   └── Returns { finalSignal: 'BUY'|'SELL'|'HOLD', ... }

4. On signal change, StrategyRunner calls /api/signals/ingest
   └── Payload: { strategy_id, signal, price, ts }
   └── Backend trade_engine.py processes signal

5. trade_engine.py manages position state machine:
   └── NONE + BUY → Opens LONG position
   └── LONG + SELL → Closes LONG, Opens SHORT (trade recorded)
   └── SHORT + BUY → Closes SHORT, Opens LONG (trade recorded)

6. Completed trade saved to data/percent_trades.json
   └── Analytics computed from this file ONLY
```

---

## Strategy Isolation Guarantees

| Scenario | Expected Behavior |
|----------|------------------|
| Strategy A emits BUY, Strategy B emits SELL | Each opens its OWN position |
| Strategy A disabled, Strategy B enabled | Only Strategy B can trade |
| No strategies enabled | Zero trades possible |
| Strategy edited in builder | No trades until saved & enabled |

---

## Files Modified

| File | Changes |
|------|---------|
| `frontend/src/tradeTracker.js` | Added strategy isolation, enabled checks |
| `frontend/src/WorkflowBuilder.jsx` | Removed trade tracking from live mode |
| `backendapi/backendapi/api/backend.py` | Disabled sample/random trade generation |
| `backendapi/frontend/src/tradeTracker.js` | Synced with main frontend |
| `backendapi/frontend/src/WorkflowBuilder.jsx` | Synced with main frontend |

---

## Testing Recommendations

1. **Clear existing data** before testing:
   - Browser: Clear `flowgrid_live_trades_v1`, `flowgrid_live_position_v1`, `flowgrid_positions_by_strategy_v1`
   - Backend: Delete `backendapi/backendapi/data/percent_trades.json`

2. **Verify no trades appear** when:
   - WorkflowBuilder is in live mode (no strategy saved)
   - All strategies are disabled in Dashboard
   - Refreshing page with no strategies enabled

3. **Verify trades ARE recorded** when:
   - Strategy is saved AND enabled via Dashboard toggle
   - Signal alternates BUY → SELL → BUY
   - Each trade tagged with correct strategy_id

---

## Analytics Source of Truth

All analytics now derive from the **backend trade_engine.py** completed trades file:
- Path: `backendapi/backendapi/data/percent_trades.json`
- API: `GET /api/trades`
- Analytics: `GET /api/analytics/overview`

Frontend localStorage trades (`flowgrid_live_trades_v1`) are secondary/legacy and will be phased out.
