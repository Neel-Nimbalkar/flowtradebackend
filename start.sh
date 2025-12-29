#!/bin/bash

# FlowGrid Trading - Mac/Linux Startup Script
# Usage: ./start.sh

echo "🚀 Starting FlowGrid Trading Platform..."
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backendapi/backendapi"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Load environment variables from .env files
if [ -f "$BACKEND_DIR/.env" ]; then
    echo "Loading backend environment variables..."
    set -a
    source "$BACKEND_DIR/.env"
    set +a
fi

# Kill any existing processes on our ports
echo "Clearing ports..."
lsof -ti :8000 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti :5174 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1

# Start Backend
echo "Starting Backend on port 8000..."
cd "$BACKEND_DIR"
PYTHONPATH="$BACKEND_DIR" nohup python3 -c "
import sys
sys.path.insert(0, '$BACKEND_DIR')
from api.backend import app
print('FlowGrid Trading Backend Server')
print('Running on http://localhost:8000')
app.run(host='0.0.0.0', port=8000, debug=False)
" > /tmp/flowgrid-backend.log 2>&1 &

echo "✅ Backend started (logs: /tmp/flowgrid-backend.log)"

# Start Frontend
echo "Starting Frontend on port 5174..."
cd "$FRONTEND_DIR"
nohup npm run dev > /tmp/flowgrid-frontend.log 2>&1 &

sleep 3

echo ""
echo "🎉 FlowGrid Trading is ready!"
echo ""
echo "   Frontend: http://localhost:5174"
echo "   Backend:  http://localhost:8000"
echo ""
echo "To view logs:"
echo "   Backend:  tail -f /tmp/flowgrid-backend.log"
echo "   Frontend: tail -f /tmp/flowgrid-frontend.log"
echo ""
echo "To stop services, run: ./stop.sh"
