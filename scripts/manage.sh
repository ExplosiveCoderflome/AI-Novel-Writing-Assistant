#!/bin/bash

# Resolve the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.services.pid"
LOG_DIR="$PROJECT_ROOT/.logs"

mkdir -p "$LOG_DIR"

function check_status() {
    local active=0
    
    echo "=== Service Status ==="
    
    # Check Port 3000 (Backend)
    local backend_pid=$(lsof -t -i :3000 2>/dev/null)
    if [ -n "$backend_pid" ]; then
        echo "✅ Backend (Port 3000): Running (PID: $backend_pid)"
        active=1
    else
        echo "❌ Backend (Port 3000): Stopped"
    fi
    
    # Check Port 5173 (Frontend)
    local frontend_pid=$(lsof -t -i :5173 2>/dev/null)
    if [ -n "$frontend_pid" ]; then
        echo "✅ Frontend (Port 5173): Running (PID: $frontend_pid)"
        active=1
    else
        echo "❌ Frontend (Port 5173): Stopped"
    fi
    
    # Check Shared Compiler
    local shared_pid=$(pgrep -f "tsc -p tsconfig.json --watch")
    if [ -n "$shared_pid" ]; then
        echo "✅ Shared Compiler (tsc): Running (PID: $shared_pid)"
        active=1
    else
        echo "❌ Shared Compiler (tsc): Stopped"
    fi
    
    return $active
}

function start_services() {
    echo "Starting services..."
    cd "$PROJECT_ROOT"
    
    # Check if already running
    if lsof -i :3000 >/dev/null 2>&1 || lsof -i :5173 >/dev/null 2>&1; then
        echo "Warning: Ports 3000 or 5173 are already in use."
        check_status
        echo "Please stop them first using '$0 stop' if they are lingering."
        exit 1
    fi
    
    # Start Shared watch
    echo "Starting Shared Compiler in background..."
    nohup pnpm dev:shared > "$LOG_DIR/shared.log" 2>&1 &
    local pid_shared=$!
    
    # Start Server
    echo "Starting Backend Server in background..."
    nohup pnpm dev:server > "$LOG_DIR/server.log" 2>&1 &
    local pid_server=$!
    
    # Start Client
    echo "Starting Frontend Client in background..."
    nohup pnpm dev:client > "$LOG_DIR/client.log" 2>&1 &
    local pid_client=$!
    
    # Save PIDs
    echo "$pid_shared" > "$PID_FILE"
    echo "$pid_server" >> "$PID_FILE"
    echo "$pid_client" >> "$PID_FILE"
    
    echo "Services started in background. Waiting a moment to verify ports..."
    sleep 3
    
    check_status
    echo "Logs are available in: $LOG_DIR"
}

function stop_services() {
    echo "Stopping services..."
    
    # 1. Kill saved PIDs if exist
    if [ -f "$PID_FILE" ]; then
        while read -r pid; do
            if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
                echo "Killing process $pid..."
                kill "$pid" 2>/dev/null
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    
    # 2. Kill by ports to be clean (handling spawned subprocesses)
    local backend_pid=$(lsof -t -i :3000 2>/dev/null)
    if [ -n "$backend_pid" ]; then
        echo "Killing Backend on port 3000 (PID: $backend_pid)..."
        kill -9 $backend_pid 2>/dev/null
    fi
    
    local frontend_pid=$(lsof -t -i :5173 2>/dev/null)
    if [ -n "$frontend_pid" ]; then
        echo "Killing Frontend on port 5173 (PID: $frontend_pid)..."
        kill -9 $frontend_pid 2>/dev/null
    fi
    
    # 3. Kill shared compiler if still running
    local shared_pids=$(pgrep -f "tsc -p tsconfig.json --watch")
    if [ -n "$shared_pids" ]; then
        echo "Killing Shared Compiler (tsc)..."
        kill -9 $shared_pids 2>/dev/null
    fi
    
    echo "All services stopped."
}

case "$1" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    status)
        check_status
        ;;
    restart)
        stop_services
        sleep 1
        start_services
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart}"
        exit 1
        ;;
esac
