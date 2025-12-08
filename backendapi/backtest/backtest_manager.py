"""
Lightweight BacktestManager for local development.
- Filesystem-backed job store (outputs/backtests/<job_id>.json)
- Background worker thread that processes queued jobs sequentially
- Uses existing `fetch_bars_full` and `workflow_engine` to evaluate workflow blocks per bar
This is an MVP to avoid external queue dependencies (Redis/Celery) and let you rapidly iterate.
"""
import os
import json
import time
import uuid
import threading
from datetime import datetime, timedelta
from typing import Dict, Any, List

# Import fetch and workflow engine directly to avoid circular import with backend
from backendapi.integrations.alpaca_fetch import fetch_bars_full
from backendapi.workflows.workflow_engine import WorkflowEngine

# Create a local workflow engine instance for the manager to use
workflow_engine = WorkflowEngine()

# Point to the outputs directory at project root
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUTDIR = os.path.join(ROOT, 'outputs', 'backtests')
os.makedirs(OUTDIR, exist_ok=True)

JOB_POLL_INTERVAL = 1.0

class BacktestManager:
    def __init__(self):
        self.jobs_index = {}  # job_id -> metadata (kept in-memory for quick access)
        self.queue = []
        self.lock = threading.Lock()
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()

    def _save_job_file(self, job_id: str, payload: Dict[str, Any]):
        path = os.path.join(OUTDIR, f"{job_id}.json")
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, indent=2, default=str)
        return path

    def submit_job(self, job_request: Dict[str, Any]) -> Dict[str, Any]:
        job_id = job_request.get('job_id') or str(uuid.uuid4())
        now = datetime.utcnow().isoformat() + 'Z'
        meta = {
            'job_id': job_id,
            'status': 'queued',
            'created_at': now,
            'updated_at': now,
            'request': job_request,
            'progress': 0,
            'result_path': None,
            'error': None
        }
        self.jobs_index[job_id] = meta
        self._save_job_file(job_id, meta)
        with self.lock:
            self.queue.append(job_id)
        return meta

    def get_job(self, job_id: str) -> Dict[str, Any]:
        path = os.path.join(OUTDIR, f"{job_id}.json")
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return self.jobs_index.get(job_id, None)

    def _worker_loop(self):
        while True:
            job_id = None
            with self.lock:
                if self.queue:
                    job_id = self.queue.pop(0)
            if not job_id:
                time.sleep(JOB_POLL_INTERVAL)
                continue
            try:
                self._run_job(job_id)
            except Exception as e:
                meta = self.jobs_index.get(job_id, {})
                meta['status'] = 'failed'
                meta['error'] = str(e)
                meta['updated_at'] = datetime.utcnow().isoformat() + 'Z'
                self._save_job_file(job_id, meta)

    def _run_job(self, job_id: str):
        meta = self.jobs_index.get(job_id)
        if not meta:
            return
        req = meta.get('request', {})
        meta['status'] = 'running'
        meta['updated_at'] = datetime.utcnow().isoformat() + 'Z'
        self._save_job_file(job_id, meta)

        try:
            # Allow workflow to provide an `alpaca_config` block that overrides symbol/timeframe/keys
            symbol = req.get('symbol', None)
            timeframe = req.get('timeframe', None)
            api_key_override = None
            api_secret_override = None
            # inspect workflow blocks for alpaca_config
            try:
                for b in (workflow_blocks or []):
                    if isinstance(b, dict) and b.get('type') == 'alpaca_config':
                        params = b.get('params') or {}
                        if not symbol:
                            symbol = params.get('symbol') or symbol
                        if not timeframe:
                            timeframe = params.get('timeframe') or timeframe
                        # keys may be provided under multiple names
                        api_key_override = api_key_override or params.get('keyId') or params.get('api_key') or params.get('apiKey')
                        api_secret_override = api_secret_override or params.get('secretKey') or params.get('api_secret') or params.get('apiSecret')
            except Exception:
                pass
            symbol = symbol or 'SPY'
            timeframe = timeframe or '1Hour'
            start = req.get('start')
            end = req.get('end')
            workflow_blocks = req.get('workflow', [])
            indicator_params = req.get('indicator_params', {})

            # Convert start/end to RFC if strings
            # For simplicity assume start/end are ISO strings, else fetch default recent days
            if not start or not end:
                end_dt = datetime.utcnow()
                days = int(req.get('days', 90) or 90)
                start_dt = end_dt - timedelta(days=days)
                start = start or start_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
                end = end or end_dt.strftime('%Y-%m-%dT%H:%M:%SZ')

            # pass through API keys from workflow if present
            if api_key_override or api_secret_override:
                bars = fetch_bars_full(symbol, start, end, timeframe, api_key=api_key_override, api_secret=api_secret_override)
            else:
                bars = fetch_bars_full(symbol, start, end, timeframe)
            # Debug logging to understand empty results from alpaca_fetch
            try:
                close_count = len(bars.get('close', [])) if isinstance(bars, dict) else 0
            except Exception:
                close_count = 0
            print(f"BacktestManager: fetched bars for {symbol} timeframe={timeframe} start={start} end={end} close_count={close_count}")
            if not bars or not bars.get('close'):
                raise RuntimeError('No bars returned for symbol/timeframe')

            # Delegate core logic to backtest_core.run_backtest for testability
            try:
                from backtest_core import run_backtest
            except Exception:
                # If import fails, raise to mark job failed
                raise


            # Use the real workflow engine by default
            execute_fn = lambda workflow, latest: workflow_engine.execute_workflow(workflow, latest)

            # pull execution config from request if present
            execution_cfg = req.get('execution', {}) if isinstance(req, dict) else {}

            result = run_backtest(symbol, timeframe, bars, workflow_blocks, execute_fn, initial_cash=100000.0, execution_config=execution_cfg)

            # persist
            outpath = self._save_job_file(job_id, {**meta, 'status': 'completed', 'result': result, 'progress': 100, 'updated_at': datetime.utcnow().isoformat() + 'Z'})
            self.jobs_index[job_id]['status'] = 'completed'
            self.jobs_index[job_id]['result_path'] = outpath
            self.jobs_index[job_id]['updated_at'] = datetime.utcnow().isoformat() + 'Z'

        except Exception as e:
            meta['status'] = 'failed'
            meta['error'] = str(e)
            meta['updated_at'] = datetime.utcnow().isoformat() + 'Z'
            self._save_job_file(job_id, meta)
            raise


# Create a singleton manager for the running server
_manager = None

def get_manager():
    global _manager
    if _manager is None:
        _manager = BacktestManager()
    return _manager

if __name__ == '__main__':
    # quick command-line test
    mgr = get_manager()
    print('BacktestManager started (MVP)')
