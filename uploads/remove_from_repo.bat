@echo off
REM Wrapper to run the remove_from_repo.ps1 from within the uploads folder
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\remove_from_repo.ps1" %*
pause
