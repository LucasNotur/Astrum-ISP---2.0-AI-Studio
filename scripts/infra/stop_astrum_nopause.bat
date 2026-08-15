@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul

:: Versao do stop sem pause no final (usada pelo restart)
call "%~dp0astrum.config.bat"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\stop.log"

echo  [1/3] Fechando Cloudflare Tunnels...
taskkill /im cloudflared.exe /f >nul 2>nul
echo     + Tunnels encerrados

echo  [2/3] Parando backend Node.js...
taskkill /fi "windowtitle eq Astrum Server*" /f >nul 2>nul
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%EXPRESS_PORT% .*LISTENING"') do (
    taskkill /pid %%p /f >nul 2>nul
)
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%FASTIFY_PORT% .*LISTENING"') do (
    taskkill /pid %%p /f >nul 2>nul
)
echo     + Backend encerrado

echo  [3/3] Parando containers Docker...
%COMPOSE_CMD% stop %DOCKER_SERVICES% >nul 2>&1
echo     + Containers parados

endlocal
