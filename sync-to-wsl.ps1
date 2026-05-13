# Sync project from Windows to WSL and open in VS Code Remote
$wslCmd = @"
rsync -a --delete --exclude=node_modules --exclude=.git /mnt/d/гермес/ ~/site-hub/
cd ~/site-hub
code .
"@
wsl -d Ubuntu-24.04 -- bash -c $wslCmd
