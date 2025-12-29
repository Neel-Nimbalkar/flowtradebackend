# FlowGrid Trading - Windows PowerShell Startup Script
# Usage: .\start.ps1

Write-Host "🚀 Starting FlowGrid Trading Platform..." -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ScriptDir "backendapi\backendapi"
$FrontendDir = Join-Path $ScriptDir "frontend"

# Kill any existing processes on our ports
Write-Host "Clearing ports..."
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

# Start Backend
Write-Host "Starting Backend on port 8000..." -ForegroundColor Green
$env:PYTHONPATH = $BackendDir
Start-Process -FilePath "python" -ArgumentList "-c", "import sys; sys.path.insert(0, '$BackendDir'); from api.backend import app; app.run(host='0.0.0.0', port=8000, debug=False)" -WorkingDirectory $BackendDir -WindowStyle Hidden
Write-Host "✅ Backend started"

# Start Frontend
Write-Host "Starting Frontend on port 5174..." -ForegroundColor Green
Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory $FrontendDir -WindowStyle Hidden
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "🎉 FlowGrid Trading is ready!" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Frontend: http://localhost:5174" -ForegroundColor Yellow
Write-Host "   Backend:  http://localhost:8000" -ForegroundColor Yellow
Write-Host ""
Write-Host "To stop services, run: .\stop.ps1"
