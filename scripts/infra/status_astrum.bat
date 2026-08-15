@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul
title Astrum — Status

:: ══════════════════════════════════════════════════════════════
::  status_astrum.bat — Exibe o estado de todos os servicos
:: ══════════════════════════════════════════════════════════════

call "%~dp0astrum.config.bat"

echo.
echo  ========================================================
echo       ASTRUM ISP — Status dos Servicos
echo  ========================================================
echo.

:: Docker Engine
echo  [Docker Engine]
docker info >nul 2>nul
if !errorlevel! equ 0 (
    echo     + Docker Engine rodando
) else (
    echo     X Docker Engine PARADO
    echo.
    pause
    exit /b 1
)
echo.

:: Containers
echo  [Containers]
for %%c in (%EXPECTED_CONTAINERS%) do (
    for /f "tokens=*" %%s in ('docker inspect --format "{{.State.Status}}" %%c 2^>nul') do (
        if "%%s"=="running" (
            echo     + %%c: running
        ) else (
            echo     X %%c: %%s
        )
    )
    if !errorlevel! neq 0 echo     X %%c: nao existe
)

:: Redis health especifico
for /f "tokens=*" %%h in ('docker inspect --format "{{.State.Health.Status}}" astrum-redis 2^>nul') do (
    echo       Redis health: %%h
)
echo.

:: Backend
echo  [Backend]
curl -sf %HEALTH_EXPRESS% >nul 2>nul
if !errorlevel! equ 0 (echo     + Express :%EXPRESS_PORT% ONLINE) else (echo     X Express :%EXPRESS_PORT% OFFLINE)

curl -sf %HEALTH_FASTIFY% >nul 2>nul
if !errorlevel! equ 0 (echo     + Fastify :%FASTIFY_PORT% ONLINE) else (echo     X Fastify :%FASTIFY_PORT% OFFLINE)
echo.

:: Tunnels
echo  [Cloudflare Tunnels]
set "TUNNEL_COUNT=0"
for /f %%n in ('tasklist /fi "imagename eq cloudflared.exe" /nh 2^>nul ^| find /c "cloudflared"') do (
    set "TUNNEL_COUNT=%%n"
)
if !TUNNEL_COUNT! gtr 0 (
    echo     + cloudflared: !TUNNEL_COUNT! instancia(s) ativa(s)
) else (
    echo     X cloudflared: PARADO
)
echo.

:: Portas em uso
echo  [Portas]
for %%p in (%EXPRESS_PORT% %FASTIFY_PORT% 6379 6333 8000 8080) do (
    netstat -ano 2>nul | findstr ":%%p .*LISTENING" >nul 2>nul
    if !errorlevel! equ 0 (echo     + Porta %%p: em uso) else (echo     - Porta %%p: livre)
)
echo.
echo  [URLs locais]
echo     Redis:        redis://localhost:6379
echo     Qdrant UI:    http://localhost:6333/dashboard
echo     Zep:          http://localhost:8000
echo     Evolution:    http://localhost:8080
echo.
echo  ========================================================
echo.

endlocal
pause
