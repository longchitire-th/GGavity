@echo off
title Daily Tire Purchasing App
echo =======================================================
echo    Starting Daily Tire Purchasing App...
echo =======================================================
start "" "http://localhost:3838"
node server.js
pause
