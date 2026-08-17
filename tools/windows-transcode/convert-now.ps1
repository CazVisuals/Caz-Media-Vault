$worker='D:\ConstantsHub-Worker\worker.ps1'
if (!(Test-Path $worker)) { throw 'Worker is not installed. Run install.ps1 first.' }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $worker -RunNow -MediaRoot '\\192.168.0.15\video' -WorkRoot 'D:\ConstantsHub-Transcode'
