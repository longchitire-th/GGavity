@echo off
title Daily Tire Purchasing App + Cloudflare Tunnel
echo ======================================================================
echo    Starting Daily Tire Purchasing App with Cloudflare Tunnel...
echo ======================================================================
echo.
echo [1/2] Opening Local Browser (http://localhost:3838)...
start "" "http://localhost:3838"

echo [2/2] Launching Cloudflare Tunnel for Mobile / Remote Access...
echo       A public HTTPS link (https://...trycloudflare.com) will be generated.
echo       You can open this link on your phone from anywhere (4G/5G/Wi-Fi)!
echo.
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3838"

node server.js
pause
