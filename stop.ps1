# FlowGrid Trading - Windows PowerShell Stop Script
# Usage: .\stop.ps1

Write-Host "🛑 Stopping FlowGrid Trading Platform..." -ForegroundColor Cyan

# Kill backend (port 8000)
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { 
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue 
}
Write-Host "✅ Backend stopped"

# Kill frontend (port 5174)
Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue | ForEach-Object { 
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue 
}
# Also kill any node/vite processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "✅ Frontend stopped"

Write-Host ""
Write-Host "All services stopped." -ForegroundColor Green
