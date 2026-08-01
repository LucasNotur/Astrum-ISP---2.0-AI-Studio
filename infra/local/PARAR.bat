@echo off
chcp 65001 >nul 2>nul
title Astrum Backend — Parando...
color 0C

set "ROOT=%~dp0..\.."
pushd "%ROOT%" || exit /b 1
set "ROOT=%CD%"

echo.
echo  ========================================================
echo          ASTRUM ISP — Parando Backend
echo  ========================================================
echo.

echo [1/3] Fechando tunnels Cloudflare...
taskkill /fi "windowtitle eq Tunnel API*" /f >nul 2>nul
taskkill /fi "windowtitle eq Tunnel Webhooks*" /f >nul 2>nul
taskkill /im cloudflared.exe /f >nul 2>nul
echo    OK — Tunnels fechados.

echo [2/3] Parando servidor Node.js...
taskkill /fi "windowtitle eq Astrum Server*" /f >nul 2>nul
:: Mata processos tsx/node que estejam rodando o server.ts
for /f "tokens=2" %%p in ('netstat -ano 2^>nul ^| findstr ":3000.*LISTENING" 2^>nul') do (
    taskkill /pid %%p /f >nul 2>nul
)
for /f "tokens=2" %%p in ('netstat -ano 2^>nul ^| findstr ":3001.*LISTENING" 2^>nul') do (
    taskkill /pid %%p /f >nul 2>nul
)
echo    OK — Servidor parado.

echo [3/3] Parando Docker (Redis + Qdrant)...
docker compose -f "%ROOT%\docker-compose.yml" -f "%ROOT%\docker-compose.dev.yml" stop redis qdrant
echo    OK — Docker parado (dados preservados).

echo.
echo  ========================================================
echo              TUDO PARADO
echo  ========================================================
echo.
echo   Redis e Qdrant pararam mas os volumes persistem.
echo   Para apagar os dados: docker compose down -v
echo.

popd
pause
