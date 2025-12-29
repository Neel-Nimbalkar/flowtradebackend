#!/bin/bash

# FlowGrid Trading - Mac/Linux Stop Script
# Usage: ./stop.sh

echo "🛑 Stopping FlowGrid Trading Platform..."

# Kill backend
lsof -ti :8000 2>/dev/null | xargs kill -9 2>/dev/null
echo "✅ Backend stopped"

# Kill frontend
lsof -ti :5174 2>/dev/null | xargs kill -9 2>/dev/null
pkill -f "vite" 2>/dev/null
echo "✅ Frontend stopped"

echo ""
echo "All services stopped."
