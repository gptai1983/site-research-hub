#!/bin/bash
cd ~/site-hub
nohup npx tsx src/index.ts > server.log 2>&1 &
PID=$!
echo $PID > server.pid
echo "Server PID: $PID"
sleep 3
if kill -0 $PID 2>/dev/null; then
  echo "Server running on port 3000"
  ss -tlnp | grep 3000
else
  echo "Server failed to start"
  tail -20 server.log
fi
