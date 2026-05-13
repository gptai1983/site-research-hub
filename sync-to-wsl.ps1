# Sync project from Windows to WSL and restart server
$wslCmd = @"
rsync -a --delete \
  --exclude=node_modules \
  --exclude=.git \
  --exclude='*.db' \
  --exclude='*.log' \
  --exclude=backups/ \
  /mnt/d/гермес/ ~/site-hub/ 2>/dev/null
"@
wsl -d Ubuntu-24.04 -- bash -c $wslCmd

# Restart server
wsl -d Ubuntu-24.04 -u pppoo bash -c "pkill -f 'tsx.*src/index' 2>/dev/null; pkill -f 'tail -f /dev/null' 2>/dev/null; sleep 1"
Start-Sleep -Seconds 1
Start-Process -WindowStyle Hidden wsl -ArgumentList "-d", "Ubuntu-24.04", "-u", "pppoo", "bash", "-c", "cd /home/pppoo/site-hub && nohup /home/pppoo/site-hub/node_modules/.bin/tsx /home/pppoo/site-hub/src/index.ts > /home/pppoo/site-hub/server.log 2>&1 & tail -f /dev/null"
Start-Sleep -Seconds 5
wsl -d Ubuntu-24.04 -e bash -c 'curl -s http://localhost:3000/health'
