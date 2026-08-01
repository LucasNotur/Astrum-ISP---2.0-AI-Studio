@echo off
chcp 65001 >nul 2>nul
title Tunnel Webhooks (3000)

echo ========================================================
echo  TUNNEL WEBHOOKS — Express (porta 3000)
echo ========================================================
echo.
echo  Copie a URL https://xxx.trycloudflare.com que aparecer
echo  e configure na Evolution API como Webhook URL
echo.
echo ========================================================
echo.

cloudflared tunnel --url http://localhost:3000
