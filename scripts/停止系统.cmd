@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(5001,8088); foreach($port in $ports){ netstat -ano | Select-String (':'+$port+'\s+.*LISTENING') | ForEach-Object { $parts=($_.Line -split '\s+') | Where-Object { $_ }; $processId=[int]$parts[-1]; if($processId -gt 0){ Write-Host ('Stopping port {0} PID {1}' -f $port,$processId); Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue } } }; Write-Host 'Done.'"
pause
