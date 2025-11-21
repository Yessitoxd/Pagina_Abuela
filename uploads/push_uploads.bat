@echo off
REM Double-click or drag files here (dragging optional). This wrapper runs push_uploads.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\push_uploads.ps1" %*
pause
