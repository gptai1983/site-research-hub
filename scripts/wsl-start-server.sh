#!/bin/bash
cd /home/pppoo/site-hub
rm -f server.pid server.log
exec setsid /bin/bash << 'INNER'
  cd /home/pppoo/site-hub
  npx tsx src/index.ts > server.log 2>&1 &
  PID=$!
  echo $PID > server.pid
  echo "Started PID $PID" >> server.log
  wait $PID
INNER
