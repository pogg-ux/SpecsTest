@echo off
cd /d "%~dp0"
set /p MSG=Commit message (Enter for default): 
if "%MSG%"=="" set MSG=Save progress
git add -A
git commit -m "%MSG%"
git push
echo.
echo Done. Press any key to close.
pause >nul
