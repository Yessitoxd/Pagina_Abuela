@echo off
REM Wrapper to run the upload_and_push.ps1 from within the uploads folder
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\upload_and_push.ps1" %*
pause
