@echo off
title SmartLearn Development Server
cd /d "%~dp0"

echo ========================================================
echo          STARTING SMARTLEARN APPLICATION
echo ========================================================
echo.
echo Starting FastAPI Backend (Port 8080) and Frontend (Port 5500)...
echo.

python main.py

pause
