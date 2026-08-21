@echo off
setlocal enabledelayedexpansion

:: NOTA: sem "chcp 65001" de proposito — combinado com saida redirecionada
:: (como no runner do GitHub Actions, sem console real) o chcp 65001 corrompe
:: o parsing de "call" com %~dp0 no cmd.exe. Log fica em ASCII simples.

:: ========================================================
::  deploy_restart_backend.bat - Reinicio nao-interativo do backend
::
::  Usado pelo workflow "Deploy - Producao" (GitHub Actions,
::  runner self-hosted nesta maquina). Reinicia SOMENTE o
::  backend Fastify (apps/api) - Docker (Redis/Qdrant) e o
::  tunnel Cloudflare continuam rodando sem interrupcao.
::
::  Sem "pause": precisa terminar sozinho quando chamado pelo CI.
::  Termina com exit /b 1 em caso de falha (o step do workflow falha).
:: ========================================================

call "%~dp0astrum.config.bat"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\deploy.log"

echo [%date% %time%] === DEPLOY: reiniciando backend === >> "%LOG_FILE%"

echo  [1/2] Parando backend atual...
set "KILLED=0"
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":%BACKEND_PORT% .*LISTENING"') do (
    taskkill /pid %%p /f >nul 2>nul && set /a "KILLED+=1"
)
echo [%date% %time%] Backend anterior encerrado (!KILLED! processo(s)) >> "%LOG_FILE%"

echo  [2/2] Subindo backend novo...
wscript "%~dp0launch_hidden.vbs" "server" "%~dp0run_backend.bat"

set /a "WAIT=0"
:wait_loop
timeout /t 3 /nobreak >nul
set /a "WAIT+=3"
curl -sf %HEALTH_BACKEND% >nul 2>nul
if !errorlevel! equ 0 goto :ok
if !WAIT! geq 90 (
    echo [%date% %time%] ERRO: backend nao respondeu em 90s >> "%LOG_FILE%"
    echo  X Backend nao respondeu em 90s - veja %LOG_FILE%
    endlocal
    exit /b 1
)
goto :wait_loop

:ok
echo [%date% %time%] Backend OK (aguardou %WAIT%s) === FIM DEPLOY === >> "%LOG_FILE%"
echo  + Backend respondeu em %WAIT%s
endlocal
exit /b 0
