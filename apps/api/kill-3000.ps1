$line = netstat -ano | findstr :3000 | findstr LISTENING
if ($line) {
  $portPid = ($line -split '\s+')[-1]
  taskkill /PID $portPid /F
  Write-Host "Matou PID $portPid na porta 3000"
} else {
  Write-Host "Porta 3000 livre"
}
