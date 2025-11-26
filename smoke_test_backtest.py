#!/usr/bin/env python3
import requests, time, os, json, sys
BASE='http://127.0.0.1:5000'
try:
    h = requests.get(f'{BASE}/health', timeout=5).json()
    print('Health:', h)
except Exception as e:
    print('Backend health check failed:', e)
    sys.exit(2)

payload = {'symbol':'SPY','timeframe':'1h','days':1}
try:
    r = requests.post(f'{BASE}/api/backtest/start', json=payload, timeout=10)
    r.raise_for_status()
    j = r.json()
    job_id = j.get('job_id')
    print('Started job:', job_id)
except Exception as e:
    print('Failed to start backtest:', e)
    sys.exit(3)

status = None
for i in range(60):
    try:
        s = requests.get(f'{BASE}/api/backtest/status/{job_id}', timeout=5).json()
        status = s.get('status')
        print(f'[{i}] status:', status)
        if status in ('complete','completed','failed'):
            break
    except Exception as e:
        print('Status request failed:', e)
        break
    time.sleep(1)

try:
    res = requests.get(f'{BASE}/api/backtest/results/{job_id}', timeout=10)
    res.raise_for_status()
    data = res.json()
except Exception as e:
    print('Failed to fetch results:', e)
    sys.exit(4)

outdir = os.path.join(os.getcwd(), 'outputs')
if not os.path.exists(outdir):
    os.makedirs(outdir, exist_ok=True)
outpath = os.path.join(outdir, f'backtest_smoke_{job_id}.json')
with open(outpath, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)
print('Wrote results to', outpath)
# Print a short summary
print('Job_id:', data.get('job_id'))
print('Status:', data.get('status'))
res_obj = data.get('result') or {}
metrics = res_obj.get('metrics') or res_obj.get('metrics', {})
print('Metrics keys:', list(res_obj.get('metrics', {}).keys()))
equity = res_obj.get('equityCurve') or res_obj.get('equity_curve') or []
print('Equity points:', len(equity))
if equity:
    print('First 3 equity samples:', equity[:3])

print('\nDone')
