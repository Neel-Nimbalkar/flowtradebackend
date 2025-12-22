#!/usr/bin/env python3
"""
Generate interactive HTML visualization of strategy results.
Uses lightweight Chart.js for plotting candlestick + indicators.
"""
import json
import os
from typing import List, Dict, Any

def generate_chart_html(
    symbol: str,
    timeframe: str,
    bars: Dict[str, List[float]],
    indicators: Dict[str, List[Any]],
    output_file: str = "strategy_chart.html"
) -> str:
    """
    Generate an interactive HTML chart with candlesticks and indicators.
    
    Args:
        symbol: Ticker symbol
        timeframe: Bar timeframe
        bars: Dict with 'open', 'high', 'low', 'close', 'volume' arrays
        indicators: Dict of indicator name -> computed values
        output_file: Output HTML filename
    
    Returns:
        Path to generated HTML file
    """
    
    # Prepare data
    n_bars = len(bars['close'])
    labels = [f"Bar {i}" for i in range(n_bars)]
    
    # OHLC for candlestick
    ohlc_data = []
    for i in range(n_bars):
        ohlc_data.append({
            'x': i,
            'o': bars['open'][i],
            'h': bars['high'][i],
            'l': bars['low'][i],
            'c': bars['close'][i]
        })
    
    # Volume data
    volume_data = bars['volume']
    
    # Prepare indicator datasets
    indicator_datasets = []
    colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']
    color_idx = 0
    
    for ind_name, ind_values in indicators.items():
        if not ind_values or len(ind_values) != n_bars:
            continue
        
        # Skip boolean indicators for now (they need special handling)
        if isinstance(ind_values[0], bool):
            continue
            
        # Convert to chart-compatible format
        clean_values = []
        for i, val in enumerate(ind_values):
            if isinstance(val, (int, float)):
                import math
                clean_values.append(None if math.isnan(val) else val)
            else:
                clean_values.append(None)
        
        indicator_datasets.append({
            'label': ind_name.upper(),
            'data': clean_values,
            'borderColor': colors[color_idx % len(colors)],
            'backgroundColor': colors[color_idx % len(colors)] + '20',
            'borderWidth': 2,
            'pointRadius': 0,
            'fill': False,
            'yAxisID': 'y1' if 'rsi' in ind_name.lower() or 'stoch' in ind_name.lower() else 'y'
        })
        color_idx += 1
    
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{symbol} {timeframe} Strategy Visualization</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-chart-financial@0.2.0/dist/chartjs-chart-financial.min.js"></script>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #0f172a;
            color: #e2e8f0;
        }}
        .container {{
            max-width: 1400px;
            margin: 0 auto;
        }}
        h1 {{
            color: #3b82f6;
            margin-bottom: 10px;
        }}
        .subtitle {{
            color: #94a3b8;
            margin-bottom: 30px;
        }}
        .chart-container {{
            position: relative;
            background: #1e293b;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }}
        canvas {{
            max-height: 500px;
        }}
        .stats {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }}
        .stat-card {{
            background: #1e293b;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
        }}
        .stat-label {{
            color: #94a3b8;
            font-size: 14px;
            margin-bottom: 5px;
        }}
        .stat-value {{
            color: #e2e8f0;
            font-size: 24px;
            font-weight: bold;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>📈 {symbol} Strategy Dashboard</h1>
        <div class="subtitle">Timeframe: {timeframe} | Bars: {n_bars}</div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-label">Last Close</div>
                <div class="stat-value">${bars['close'][-1]:.2f}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">High</div>
                <div class="stat-value">${max(bars['high']):.2f}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Low</div>
                <div class="stat-value">${min(bars['low']):.2f}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg Volume</div>
                <div class="stat-value">{sum(bars['volume'])/len(bars['volume']):.0f}</div>
            </div>
        </div>
        
        <div class="chart-container">
            <canvas id="priceChart"></canvas>
        </div>
        
        <div class="chart-container">
            <canvas id="volumeChart"></canvas>
        </div>
    </div>
    
    <script>
        const labels = {json.dumps(labels)};
        const ohlcData = {json.dumps(ohlc_data)};
        const volumeData = {json.dumps(volume_data)};
        const indicatorDatasets = {json.dumps(indicator_datasets)};
        
        // Price + Indicators Chart
        const priceCtx = document.getElementById('priceChart').getContext('2d');
        const priceChart = new Chart(priceCtx, {{
            type: 'line',
            data: {{
                labels: labels,
                datasets: [
                    {{
                        label: 'Price',
                        data: ohlcData.map(d => d.c),
                        borderColor: '#3b82f6',
                        backgroundColor: '#3b82f620',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        yAxisID: 'y'
                    }},
                    ...indicatorDatasets
                ]
            }},
            options: {{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {{
                    mode: 'index',
                    intersect: false,
                }},
                plugins: {{
                    legend: {{
                        labels: {{
                            color: '#e2e8f0'
                        }}
                    }},
                    title: {{
                        display: true,
                        text: 'Price & Indicators',
                        color: '#e2e8f0',
                        font: {{ size: 16 }}
                    }}
                }},
                scales: {{
                    x: {{
                        ticks: {{ color: '#94a3b8' }},
                        grid: {{ color: '#334155' }}
                    }},
                    y: {{
                        type: 'linear',
                        display: true,
                        position: 'left',
                        ticks: {{ color: '#94a3b8' }},
                        grid: {{ color: '#334155' }}
                    }},
                    y1: {{
                        type: 'linear',
                        display: true,
                        position: 'right',
                        ticks: {{ color: '#94a3b8' }},
                        grid: {{ display: false }},
                        min: 0,
                        max: 100
                    }}
                }}
            }}
        }});
        
        // Volume Chart
        const volumeCtx = document.getElementById('volumeChart').getContext('2d');
        const volumeChart = new Chart(volumeCtx, {{
            type: 'bar',
            data: {{
                labels: labels,
                datasets: [{{
                    label: 'Volume',
                    data: volumeData,
                    backgroundColor: '#3b82f680',
                    borderColor: '#3b82f6',
                    borderWidth: 1
                }}]
            }},
            options: {{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {{
                    legend: {{
                        labels: {{ color: '#e2e8f0' }}
                    }},
                    title: {{
                        display: true,
                        text: 'Volume',
                        color: '#e2e8f0',
                        font: {{ size: 16 }}
                    }}
                }},
                scales: {{
                    x: {{
                        ticks: {{ color: '#94a3b8' }},
                        grid: {{ color: '#334155' }}
                    }},
                    y: {{
                        ticks: {{ color: '#94a3b8' }},
                        grid: {{ color: '#334155' }}
                    }}
                }}
            }}
        }});
    </script>
</body>
</html>
"""
    
    output_path = os.path.join(os.getcwd(), output_file)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    return output_path
