@echo off
chcp 65001 >nul 2>nul
title Astrum — Status

echo.
echo  ========================================================
echo           ASTRUM ISP — Status dos Servicos
echo  ========================================================
echo.

echo  [Docker]
docker inspect --format "  Redis:  {{.State.Health.Status}}" astrum-redis 2>nul || echo   Redis:  PARADO
docker inspect --format "  Qdrant: {{.State.Status}}" astrum-qdrant 2>nul || echo   Qdrant: PARADO
echo.

echo  [Servidor]
curl -sf http://localhost:3000/api/health >nul 2>nul && (echo   Express:3000  ONLINE) || (echo   Express:3000  OFFLINE)
curl -sf http://localhost:3001/api/v2/health >nul 2>nul && (echo   Fastify:3001  ONLINE) || (echo   Fastify:3001  OFFLINE)
echo.

echo  [Tunnels]
tasklist /fi "imagename eq cloudflared.exe" /nh 2>nul | findstr "cloudflared" >nul 2>nul && (echo   cloudflared:  RODANDO) || (echo   cloudflared:  PARADO)
echo.

echo  ========================================================
echo.
pause
