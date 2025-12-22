// Sequential Workflow Runner for FlowGrid Trading
// Handles execution animation and visualization

// If the React migration is active, it can provide the canonical node list via
// `window.getReactNodes()`. Use that when present to avoid double-creating DOM nodes.
function getNodes() {
    try {
        if (window.getReactNodes && typeof window.getReactNodes === 'function') {
            return window.getReactNodes();
        }
        if (window.state && Array.isArray(window.state.nodes)) return window.state.nodes;
    } catch (e) {
        console.warn('getNodes helper failed', e);
    }
    return [];
}

async function runSequentialWorkflow() {
    if (getNodes().length === 0) {
        alert('Add blocks to create a workflow first');
        return;
    }

    // Get config
    let symbol = 'SPY';
    let timeframe = '1Hour';
    let days = '7';

    // Unified Alpaca configuration block preference
    const alpacaNode = getNodes().find(n => n.type === 'alpaca_config');
    if (alpacaNode && alpacaNode.configValues) {
        symbol = alpacaNode.configValues.symbol || symbol;
        timeframe = alpacaNode.configValues.timeframe || timeframe;
        days = alpacaNode.configValues.days || days;
    } else {
        // Fallback to legacy individual blocks if present
        const symbolNode = getNodes().find(n => n.type === 'symbol');
        const timeframeNode = getNodes().find(n => n.type === 'timeframe');
        const lookbackNode = getNodes().find(n => n.type === 'lookback');
        if (symbolNode) symbol = symbolNode.configValue || symbolNode.def.config.value;
        if (timeframeNode) timeframe = timeframeNode.configValue || timeframeNode.def.config.value;
        if (lookbackNode) days = String(lookbackNode.configValue || lookbackNode.def.config.value);
    }

    // Build workflow blocks in order (top to bottom)
    const sortedNodes = [...getNodes()].sort((a, b) => a.y - b.y);
    
    const workflow_blocks = sortedNodes.map(n => {
        const params = {};
        
        // Gather params from node configValues
        if (n.configValues) {
            Object.assign(params, n.configValues);
        }
        
        return {
            id: n.id,
            type: n.type,
            params: params
        };
    });

    // Gather indicator params
    const indicator_params = {};
    getNodes().forEach(n => {
        if (n.type === 'rsi' && n.configValues) {
            indicator_params['rsi'] = n.configValues;
        } else if (n.type === 'ema' && n.configValues) {
            indicator_params['ema'] = n.configValues;
        } else if (n.type === 'macd' && n.configValues) {
            indicator_params['macd'] = n.configValues;
        } else if (n.type === 'bollinger' && n.configValues) {
            indicator_params['boll'] = n.configValues;
        } else if (n.type === 'trendline' && n.configValues) {
            indicator_params['trendline'] = n.configValues;
        } else if (n.type === 'volspike' && n.configValues) {
            indicator_params['volspike'] = n.configValues;
        } else if (n.type === 'stochastic' && n.configValues) {
            indicator_params['stoch'] = n.configValues;
        }
    });

    // Show loading
    outputPanel.classList.add('open');
    outputContent.innerHTML = `
        <div class="output-section">
            <h4>🔄 Executing Sequential Workflow...</h4>
            <div style="display: flex; align-items: center; gap: 10px;">
                <div class="loading-spinner"></div>
                <span class="output-text">Processing blocks in order...</span>
            </div>
        </div>
    `;

    try {
        // Call sequential workflow endpoint
        const response = await fetch('http://localhost:5000/execute_workflow_v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol,
                timeframe,
                days: parseInt(days),
                workflow: workflow_blocks,
                indicator_params
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Backend error');
        }

        // Persist for header actions
        window.lastPanelData = data;

        // Animate execution using v2 blocks -> node state mapping
        const animBlocks = (data.blocks || []).map(b => ({ block_id: b.id, status: b.status }));
        await animateWorkflowExecution(animBlocks);

        // Display v2 results pane
        displayWorkflowResultsV2(data);

        // Update premium results panel with AI analysis and signal tracking
        if (typeof updateAIAnalysis === 'function' && data.latest_data) {
            const latestPrice = data.latest_data.close || 0;
            updateAIAnalysis(data, latestPrice);
            
            // Add to signal history if workflow completed successfully
            if (data.success && data.final_decision) {
                const signal = {
                    timestamp: new Date().toISOString(),
                    type: data.final_decision.toUpperCase(),
                    price: latestPrice,
                    trigger: data.blocks[data.blocks.length - 1]?.block_type || 'Final Block'
                };
                
                if (typeof addSignalToHistory === 'function') {
                    addSignalToHistory(signal);
                }
                
                // Auto-open results panel on first signal
                if (window.signalHistory && window.signalHistory.length === 1) {
                    const panel = document.getElementById('resultsPanel');
                    if (panel && !panel.classList.contains('open')) {
                        setTimeout(() => toggleResultsPanel(), 500);
                    }
                }
            }
        }

    } catch (err) {
        console.error('Workflow execution error:', err);
        outputContent.innerHTML = `
            <div class="output-section">
                <h4>⚠️ Workflow Execution Failed</h4>
                <p class="output-text" style="color: #f59e0b;">
                    ${err.message || 'Could not execute workflow'}
                </p>
            </div>
        `;
    }
}

async function animateWorkflowExecution(blockResults) {
    const total = blockResults.length;
    let processed = 0;
    for (const result of blockResults) {
        const nodeEl = document.getElementById(`node-${result.block_id}`);
        if (!nodeEl) continue;

        // Clear previous states
        nodeEl.classList.remove('executing', 'node-passed', 'node-failed', 'node-skipped');
        
        // Show executing state
        nodeEl.classList.add('executing');
        await new Promise(resolve => setTimeout(resolve, 400));
        nodeEl.classList.remove('executing');
        
        // Apply final state
        if (result.status === 'passed') {
            nodeEl.classList.add('node-passed');
        } else if (result.status === 'failed') {
            nodeEl.classList.add('node-failed');
            // Stop animation here - remaining blocks already marked skipped
            await new Promise(resolve => setTimeout(resolve, 600));
            processed++;
            if (typeof window.partialAnalysisUpdate === 'function') {
                window.partialAnalysisUpdate({ processed, total, lastStatus: result.status, lastType: nodeEl.getAttribute('data-node-type') || 'unknown', halted: true });
            }
            break;
        } else if (result.status === 'skipped') {
            nodeEl.classList.add('node-skipped');
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));

        processed++;
        if (typeof window.partialAnalysisUpdate === 'function') {
            window.partialAnalysisUpdate({ processed, total, lastStatus: result.status, lastType: nodeEl.getAttribute('data-node-type') || 'unknown', halted: false });
        }
    }
}

// Clear workflow node colors (called when closing insights panel)
function clearWorkflowNodeColors() {
    const nodes = getNodes();
    if (!nodes || nodes.length === 0) return;
    nodes.forEach(node => {
        const nodeEl = document.getElementById(`node-${node.id}`);
        if (nodeEl) {
            nodeEl.classList.remove('executing', 'node-passed', 'node-failed', 'node-skipped');
        }
    });
}

function displayWorkflowResults(data, symbol, timeframe, days) {
    const { success, final_decision, stop_reason, execution_time_ms, blocks, latest_data } = data;

    let resultHTML = '';

    // Overall decision
    const decisionColor = success ? '#22c55e' : '#ef4444';
    const decisionIcon = success ? '✅' : '❌';
    
    resultHTML += `
        <div class="output-section" style="border-left: 4px solid ${decisionColor};">
            <h4>${decisionIcon} Strategy Decision: ${final_decision}</h4>
            <p class="output-text" style="color: ${decisionColor}; font-weight: 600;">
                ${success ? 'All conditions met - Strategy CONFIRMED' : stop_reason}
            </p>
            <p class="output-text" style="color: #9ca3af; font-size: 12px; margin-top: 8px;">
                Execution time: ${execution_time_ms.toFixed(2)}ms
            </p>
        </div>
    `;

    // Block-by-block results
    resultHTML += `
        <div class="output-section">
            <h4>📋 Block Execution Details</h4>
            <div style="margin-top: 12px;">
    `;

    blocks.forEach((block, idx) => {
        let statusColor = '#6b7280';
        let statusIcon = '⚪';
        let statusText = block.status.toUpperCase();

        if (block.status === 'passed') {
            statusColor = '#22c55e';
            statusIcon = '✅';
        } else if (block.status === 'failed') {
            statusColor = '#ef4444';
            statusIcon = '❌';
        } else if (block.status === 'skipped') {
            statusColor = '#9ca3af';
            statusIcon = '⏭️';
        }

        resultHTML += `
            <div style="padding: 10px; margin-bottom: 8px; background: #23272f; border-left: 3px solid ${statusColor}; border-radius: 4px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-size: 16px;">${statusIcon}</span>
                    <strong style="color: #e5e7eb;">Block ${idx + 1}: ${block.block_type}</strong>
                    <span style="margin-left: auto; font-size: 11px; color: #6b7280;">${block.execution_time_ms.toFixed(1)}ms</span>
                </div>
                <p style="color: ${statusColor}; font-size: 13px; margin: 0; margin-left: 28px;">
                    ${block.message}
                </p>
                ${block.block_type === 'ai_agent' && block.data && block.data.error ? `
                    <p style="color:#f59e0b; font-size:12px; margin: 6px 0 0 28px;">
                        ⚠️ AI Error: ${block.data.error}
                    </p>
                ` : ''}
            </div>
        `;
    });

    resultHTML += `</div></div>`;

    // Strategy Performance Chart
    resultHTML += `
        <div class="output-section">
            <h4>📈 Strategy Performance Over Time</h4>
            <div class="chart-controls">
                <div class="chart-control-group">
                    <span class="chart-control-label">Time Period</span>
                    <div style="display: flex; gap: 6px;">
                        <button class="chart-period-btn" data-period="7" onclick="updateChartPeriod(7)">7D</button>
                        <button class="chart-period-btn active" data-period="30" onclick="updateChartPeriod(30)">30D</button>
                        <button class="chart-period-btn" data-period="90" onclick="updateChartPeriod(90)">90D</button>
                        <button class="chart-period-btn" data-period="180" onclick="updateChartPeriod(180)">6M</button>
                        <button class="chart-period-btn" data-period="365" onclick="updateChartPeriod(365)">1Y</button>
                    </div>
                </div>
                <button class="chart-expand-btn" onclick="expandStrategyChart()" title="Expand chart">
                    ⤢ Expand
                </button>
            </div>
            <div class="chart-legend">
                <div class="legend-item">
                    <div class="legend-color" style="background: #10b981; width: 20px; height: 20px; border-radius: 3px;"></div>
                    <span>Bullish Periods</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #ef4444; width: 20px; height: 20px; border-radius: 3px;"></div>
                    <span>Bearish Periods</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #6b7280; width: 20px; height: 20px; border-radius: 3px;"></div>
                    <span>Neutral/No Signal</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color" style="background: #60a5fa;"></div>
                    <span>Strategy Strength</span>
                </div>
            </div>
            <div class="strategy-chart-container">
                <canvas id="strategyPerformanceChart"></canvas>
                <div class="chart-tooltip" id="chartTooltip"></div>
            </div>
        </div>
    `;

    // Market data summary
    resultHTML += `
        <div class="output-section">
            <h4>📊 Market Data (${symbol})</h4>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 12px;">
                <div>
                    <span class="output-label">Price</span>
                    <span class="output-value">$${latest_data.close.toFixed(2)}</span>
                </div>
                <div>
                    <span class="output-label">Volume</span>
                    <span class="output-value">${(latest_data.volume / 1000000).toFixed(2)}M</span>
                </div>
            </div>
        </div>
    `;

    outputContent.innerHTML = resultHTML;
    
    // Initialize the strategy performance chart after DOM is ready
    setTimeout(() => {
        // Create mock analysis object from blocks
        const analysis = {
            overallSentiment: success ? 'bullish' : 'bearish',
            signals: blocks.map(b => ({
                name: b.block_type,
                sentiment: b.status === 'passed' ? 'bullish' : b.status === 'failed' ? 'bearish' : 'neutral'
            }))
        };
        
        if (typeof window.initializeStrategyChart === 'function') {
            window.initializeStrategyChart(data, analysis, symbol, timeframe, days);
        } else {
            console.error('❌ initializeStrategyChart function not found');
        }
    }, 100);

}

function updateOutputHeaderFromSummary(summary) {
    const titleEl = document.getElementById('outputHeaderTitle');
    const badgeEl = document.getElementById('outputHeaderBadge');
    if (titleEl) titleEl.textContent = summary?.strategyName || 'Strategy Results';
    if (badgeEl) {
        const status = (summary?.status || '').toLowerCase();
        badgeEl.style.display = 'inline-block';
        badgeEl.textContent = summary?.status || '';
        if (status === 'completed') {
            badgeEl.style.background = 'rgba(16,185,129,0.15)';
            badgeEl.style.color = '#86efac';
            badgeEl.style.borderColor = 'rgba(16,185,129,0.3)';
        } else if (status === 'failed') {
            badgeEl.style.background = 'rgba(239,68,68,0.15)';
            badgeEl.style.color = '#fca5a5';
            badgeEl.style.borderColor = 'rgba(239,68,68,0.3)';
        } else if (status === 'stopped') {
            badgeEl.style.background = 'rgba(245,158,11,0.15)';
            badgeEl.style.color = '#fcd34d';
            badgeEl.style.borderColor = 'rgba(245,158,11,0.3)';
        } else {
            badgeEl.style.background = 'rgba(148,163,184,0.15)';
            badgeEl.style.color = '#cbd5e1';
            badgeEl.style.borderColor = 'rgba(148,163,184,0.25)';
        }
    }
}

function displayWorkflowResultsV2(panel) {
    try {
        const summary = panel.summary || {};
        
        // Update header
        document.getElementById('outputHeaderTitle').textContent = summary.strategyName || 'Strategy Results';
        document.getElementById('outputTimestamp').textContent = new Date().toLocaleTimeString();
        const badge = document.getElementById('outputHeaderBadge');
        badge.style.display = 'inline-flex';
        badge.className = `output-status-badge ${summary.status || 'completed'}`;
        badge.textContent = summary.status || 'completed';

        let html = '';

        // 1. AI Summary
        html += `
            <div class="output-section">
                <div class="output-section-header">
                    <div class="output-section-title">🤖 AI Summary</div>
                </div>
                <div class="output-section-body">
                    <div class="ai-summary-box">
                        ${panel.aiAnalysis || 'No AI analysis available for this execution.'}
                    </div>
                </div>
            </div>
        `;

        // 2. Last 10 Signals
        html += `
            <div class="output-section">
                <div class="output-section-header">
                    <div class="output-section-title">📊 Last 10 Signals</div>
                </div>
                <div class="output-section-body">
                    <table class="signals-table">
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Signal</th>
                                <th>Price</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        // Generate signals from equity curve data (last 10 points where strategy would have executed)
        const equityCurve = panel.equityCurve || [];
        const signals = [];
        const finalSignal = (panel.finalSignal || 'HOLD').toUpperCase();
        
        // Create sample signals from last 10 data points
        for (let i = Math.max(0, equityCurve.length - 10); i < equityCurve.length; i++) {
            const point = equityCurve[i];
            // Determine signal based on price movement
            let signal = 'HOLD';
            if (i > 0) {
                const prevPoint = equityCurve[i - 1];
                const priceChange = ((point.value - prevPoint.value) / prevPoint.value) * 100;
                if (priceChange > 0.5) signal = 'BUY';
                else if (priceChange < -0.5) signal = 'SELL';
            }
            
            signals.push({
                time: point.time,
                signal: signal,
                price: point.value
            });
        }

        // Use final signal for the last entry if available
        if (signals.length > 0) {
            signals[signals.length - 1].signal = finalSignal;
        }

        signals.forEach(sig => {
            const signalClass = sig.signal === 'BUY' ? 'buy' : (sig.signal === 'SELL' ? 'sell' : 'hold');
            html += `
                <tr>
                    <td class="signal-time">${formatTimestamp(sig.time)}</td>
                    <td class="signal-action signal-${signalClass}">${sig.signal}</td>
                    <td class="signal-price">$${sig.price.toFixed(2)}</td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // 3. Current Execution
        html += `
            <div class="output-section">
                <div class="output-section-header">
                    <div class="output-section-title">⚡ Current Execution</div>
                </div>
                <div class="output-section-body">
                    <table class="execution-table">
                        <thead>
                            <tr>
                                <th>Block</th>
                                <th>Status</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        (panel.blocks || []).forEach((block, idx) => {
            const statusClass = block.status || 'skipped';
            const statusIcon = statusClass === 'passed' ? '✓' : (statusClass === 'failed' ? '✗' : '—');

            html += `
                <tr class="table-row-${statusClass}">
                    <td class="table-cell-name">${block.emoji || '🧩'} ${block.name || block.type}</td>
                    <td class="table-cell-status status-${statusClass}">${statusIcon} ${statusClass}</td>
                    <td class="table-cell-time">${(block.executionTimeMs || 0).toFixed(1)}ms</td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        outputContent.innerHTML = html;

        // Store panel data globally for debugging
        window.lastPanelData = panel;

        // Render chart after DOM update
        setTimeout(() => {
            updateBottomDrawerChart(panel);
        }, 100);

    } catch (err) {
        console.error('Error rendering results:', err);
        outputContent.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:#f23645;">
                <div style="font-size:32px; margin-bottom:12px;">⚠️</div>
                <div style="font-size:15px; font-weight:600;">Failed to render results</div>
                <div style="font-size:13px; margin-top:8px;">${err.message || err}</div>
            </div>
        `;
    }
}

// Helper: Format timestamp
function formatTimestamp(ts) {
    if (!ts) return '--';
    try {
        const d = new Date(ts);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    } catch {
        return ts;
    }
}

// Helper: Format value
function formatValue(v) {
    if (typeof v === 'number') {
        return v.toFixed(2);
    }
    if (typeof v === 'boolean') {
        return v ? '✓' : '✗';
    }
    return String(v);
}

// Helper: Toggle section
window.toggleSection = function(header) {
    const section = header.closest('.output-section');
    const toggle = header.querySelector('.output-section-toggle');
    section.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed');
}

// Helper: Toggle raw data
window.toggleRawData = function(btn, idx) {
    const raw = document.getElementById(`raw-${idx}`);
    if (raw.style.display === 'none') {
        raw.style.display = 'block';
        btn.textContent = 'Hide Raw Data';
    } else {
        raw.style.display = 'none';
        btn.textContent = 'Show Raw Data';
    }
}

// Helper: Toggle chart
window.toggleChart = function() {
    const wrapper = document.getElementById('chartWrapper');
    const btn = event.target;
    if (wrapper.style.display === 'none') {
        wrapper.style.display = 'block';
        btn.textContent = 'Hide Chart';
    } else {
        wrapper.style.display = 'none';
        btn.textContent = 'Show Chart';
    }
}

// Render equity curve
function renderEquityCurve(points) {
    const canvas = document.getElementById('equityCanvas');
    if (!canvas || !points || points.length < 2) return;

    const parent = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Clear
    ctx.fillStyle = '#131722';
    ctx.fillRect(0, 0, w, h);
    
    // Parse data
    const data = points.map(p => ({
        x: typeof p.time === 'string' ? new Date(p.time).getTime() : p.time,
        y: p.value
    }));
    
    const xMin = Math.min(...data.map(d => d.x));
    const xMax = Math.max(...data.map(d => d.x));
    const yMin = Math.min(...data.map(d => d.y));
    const yMax = Math.max(...data.map(d => d.y));
    
    const padding = { left: 50, right: 20, top: 20, bottom: 30 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    
    const toX = (val) => padding.left + ((val - xMin) / (xMax - xMin || 1)) * chartW;
    const toY = (val) => padding.top + chartH - ((val - yMin) / (yMax - yMin || 1)) * chartH;
    
    // Grid
    ctx.strokeStyle = '#2a2e39';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (i / 4) * chartH;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
    }
    
    // Y-axis labels
    ctx.fillStyle = '#787b86';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
        const val = yMin + (i / 4) * (yMax - yMin);
        const y = padding.top + chartH - (i / 4) * chartH;
        ctx.fillText('$' + val.toFixed(0), padding.left - 8, y + 4);
    }
    
    // Line
    ctx.strokeStyle = '#2962ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((d, i) => {
        const x = toX(d.x);
        const y = toY(d.y);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    
    // Fill area under curve
    ctx.fillStyle = 'rgba(41, 98, 255, 0.1)';
    ctx.lineTo(toX(data[data.length - 1].x), padding.top + chartH);
    ctx.lineTo(toX(data[0].x), padding.top + chartH);
    ctx.closePath();
    ctx.fill();
}

function renderEquityCurveV2(points) {
    // Alias for backward compatibility
    renderEquityCurve(points);
}

// Update bottom drawer chart with historical data
function updateBottomDrawerChart(panel) {
    console.log('updateBottomDrawerChart called', panel);
    
    // Wait for drawer to be ready
    const checkDrawer = () => {
        if (!window.updateDrawerChart) {
            console.warn('window.updateDrawerChart not available yet, retrying...');
            setTimeout(checkDrawer, 100);
            return;
        }
        
        const equityCurve = panel.equityCurve || [];
        console.log('Equity curve data points:', equityCurve.length);
        
        if (equityCurve.length === 0) {
            console.warn('No equity curve data available');
            return;
        }
        
        // Extract data points
        const prices = [];
        const equity = [];
        const timestamps = [];
        
        // Starting capital for strategy equity
        const startingCapital = 100000;
        let currentEquity = startingCapital;
        
        equityCurve.forEach((point, idx) => {
            const price = point.value || 0;
            prices.push(price);
            
            // Calculate equity as percentage change from initial price
            if (idx === 0) {
                equity.push(startingCapital);
            } else {
                const priceChange = (price - equityCurve[0].value) / equityCurve[0].value;
                currentEquity = startingCapital * (1 + priceChange);
                equity.push(currentEquity);
            }
            
            timestamps.push(point.time);
        });
        
        console.log('Chart data prepared:', { 
            pricePoints: prices.length, 
            equityPoints: equity.length,
            timestampPoints: timestamps.length,
            priceRange: [Math.min(...prices), Math.max(...prices)],
            equityRange: [Math.min(...equity), Math.max(...equity)]
        });
        
        // Update the drawer chart
        window.updateDrawerChart(prices, equity, timestamps);
    };
    
    checkDrawer();
}

// Header buttons
document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'rerunBtn') {
        runSequentialWorkflow();
    }
    if (e.target && e.target.id === 'downloadBtn') {
        try {
            const data = window.lastPanelData || {};
            const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `results-${Date.now()}.json`; a.click();
            URL.revokeObjectURL(url);
        } catch (err) { console.error('download error', err); }
    }
});
