@echo off
setlocal enabledelayedexpansion
title Astrum - DESLIGAR
color 0C

:: ========================================================
::  ASTRUM-DESLIGAR.bat - Botao unico: desce TODA a stack
::  e libera CPU/GPU/RAM.
::
::  Ordem: monitor OFF (1o, senao ele ressuscita o backend)
::         -> runner -> tunnel -> backend -> containers
::         -> Docker Desktop + WSL shutdown
::
::  Seguro: nao apaga volumes nem dados (docker stop, nao down -v).
::  Par do ASTRUM-LIGAR.bat.
:: ========================================================

call "%~dp0astrum.config.bat"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\desligar.log"

echo.
echo  ========================================================
echo       ASTRUM - DESLIGANDO TUDO
echo  ========================================================
echo.

:: --------------------------------------------------------
::  1) Auto-heal monitor OFF (primeiro! senao reinicia o backend)
:: --------------------------------------------------------
echo  [1/6] Desligando auto-heal monitor...
schtasks /Change /TN "AstrumHealthMonitor" /DISABLE >nul 2>nul
if !errorlevel! equ 0 ( echo      + Monitor desligado ) else ( echo      ~ Monitor ja estava off / sem permissao )
taskkill /fi "imagename eq wscript.exe" /f >nul 2>nul

:: --------------------------------------------------------
::  2) GitHub Actions Runner
:: --------------------------------------------------------
echo  [2/6] Parando GitHub Actions Runner...
taskkill /im Runner.Listener.exe /f >nul 2>nul
taskkill /im Runner.Worker.exe /f >nul 2>nul
echo      + Runner encerrado

:: --------------------------------------------------------
::  3) Cloudflare Tunnel
:: --------------------------------------------------------
echo  [3/6] Fechando Cloudflare Tunnel...
taskkill /im cloudflared.exe /f >nul 2>nul
echo      + Tunnel encerrado

:: --------------------------------------------------------
::  4) Backend Fastify (:3001)
:: --------------------------------------------------------
echo  [4/6] Parando backend...
taskkill /fi "windowtitle eq Astrum Server*" /f >nul 2>nul
set "KILLED=0"
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%BACKEND_PORT% .*LISTENING"') do (
    taskkill /pid %%p /f >nul 2>nul && set /a "KILLED+=1"
)
if !KILLED! gtr 0 ( echo      + Backend encerrado ^(!KILLED! processo^(s^)^) ) else ( echo      + Backend ja estava parado )

:: --------------------------------------------------------
::  5) Containers Docker (stop = preserva dados)
:: --------------------------------------------------------
echo  [5/6] Parando containers...
docker ps -q >nul 2>nul
if !errorlevel! neq 0 (
    echo      ~ Docker ja nao respondia - pulando
    goto :docker_down
)
for %%c in (astrum-redis astrum-qdrant evolution_api evolution_frontend evolution_redis evolution_postgres) do (
    docker stop %%c >nul 2>&1 && echo      + %%c parado
)

:: --------------------------------------------------------
::  6) Docker Desktop + WSL (libera a RAM/GPU de verdade)
:: --------------------------------------------------------
echo  [6/6] Fechando Docker Desktop + WSL...
taskkill /im "Docker Desktop.exe" /f >nul 2>nul
taskkill /im "com.docker.backend.exe" /f >nul 2>nul
taskkill /im "com.docker.build.exe" /f >nul 2>nul
taskkill /im "docker-agent.exe" /f >nul 2>nul
timeout /t 2 /nobreak >nul
wsl --shutdown >nul 2>nul
echo      + Docker Desktop e VM (WSL) desligados
:docker_down

echo.
echo  ========================================================
echo       ASTRUM DESLIGADA - recursos liberados
echo  ========================================================
echo    Dados preservados (volumes intactos).
echo    Para ligar de novo: ASTRUM-LIGAR.bat
echo.
echo    OBS: a API publica (%URL_API%) fica OFFLINE
echo         ate voce ligar de novo.
echo  ========================================================
echo.
echo [%date% %time%] DESLIGAR concluido >> "%LOG_FILE%" 2>nul
timeout /t 8
endlocal
exit /b 0
