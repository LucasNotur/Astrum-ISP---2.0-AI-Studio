@echo off
setlocal enabledelayedexpansion

:: NOTA: sem "chcp 65001" de proposito - combinado com saida redirecionada
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
::  IMPORTANTE: precisa rodar fora de qualquer sandbox de processo
::  (ex.: fora de ferramentas de agente) - senao o taskkill do
::  processo antigo falha com "Acesso negado" e o script segue
::  em frente reportando sucesso mesmo com o codigo antigo ainda
::  no ar. Por isso valida abaixo que o PID realmente mudou.
::
::  Sem "pause": precisa terminar sozinho quando chamado pelo CI.
::  Termina com exit /b 1 em caso de falha (o step do workflow falha).
:: ========================================================

call "%~dp0astrum.config.bat"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\deploy.log"

echo [%date% %time%] === DEPLOY: reiniciando backend === >> "%LOG_FILE%"

echo  [1/3] Identificando backend atual...
set "OLD_PID="
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr /C:":%BACKEND_PORT% " ^| findstr "LISTENING"') do (
    set "OLD_PID=%%p"
)

if defined OLD_PID (
    echo [%date% %time%] Backend atual: PID %OLD_PID% >> "%LOG_FILE%"
    taskkill /pid %OLD_PID% /f
    if !errorlevel! neq 0 (
        echo [%date% %time%] ERRO: falha ao encerrar PID %OLD_PID% ^(taskkill retornou !errorlevel!^) >> "%LOG_FILE%"
        echo  X Nao consegui encerrar o backend anterior ^(PID %OLD_PID%^) - veja %LOG_FILE%
        echo  X Rodando sandboxed? O runner GHA precisa rodar fora de sandbox pra ter permissao de matar processos da sessao real.
        endlocal
        exit /b 1
    )
) else (
    echo [%date% %time%] Nenhum backend rodando na porta %BACKEND_PORT% >> "%LOG_FILE%"
)

:: Espera a porta ficar livre de verdade antes de subir o novo processo
:: (evita corrida: novo processo falhando por porta ainda ocupada).
set /a "FREE_WAIT=0"
:wait_port_free
netstat -ano 2>nul | findstr /C:":%BACKEND_PORT% " | findstr "LISTENING" >nul 2>nul
if !errorlevel! neq 0 goto :port_free
set /a "FREE_WAIT+=1"
if !FREE_WAIT! geq 20 (
    echo [%date% %time%] ERRO: porta %BACKEND_PORT% continua ocupada apos encerrar PID %OLD_PID% >> "%LOG_FILE%"
    echo  X Porta %BACKEND_PORT% nao liberou - veja %LOG_FILE%
    endlocal
    exit /b 1
)
timeout /t 1 /nobreak >nul
goto :wait_port_free
:port_free

echo  [2/3] Subindo backend novo...
wscript "%~dp0launch_hidden.vbs" "server" "%~dp0deploy_run_backend.bat"

set /a "WAIT=0"
:wait_loop
timeout /t 3 /nobreak >nul
set /a "WAIT+=3"
curl -sf %HEALTH_BACKEND% >nul 2>nul
if !errorlevel! equ 0 goto :health_ok
if !WAIT! geq 90 (
    echo [%date% %time%] ERRO: backend nao respondeu em 90s >> "%LOG_FILE%"
    echo  X Backend nao respondeu em 90s - veja %LOG_FILE%
    endlocal
    exit /b 1
)
goto :wait_loop

:health_ok
echo  [3/3] Confirmando que o processo mudou...
set "NEW_PID="
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr /C:":%BACKEND_PORT% " ^| findstr "LISTENING"') do (
    set "NEW_PID=%%p"
)

if defined OLD_PID (
    if "!NEW_PID!"=="!OLD_PID!" (
        echo [%date% %time%] ERRO: PID nao mudou ^(continua %OLD_PID%^) - restart nao aconteceu de verdade >> "%LOG_FILE%"
        echo  X PID do backend nao mudou - restart NAO aconteceu de verdade
        endlocal
        exit /b 1
    )
)

echo [%date% %time%] Backend OK - PID novo: !NEW_PID! ^(aguardou %WAIT%s^) === FIM DEPLOY === >> "%LOG_FILE%"
echo  + Backend respondeu em %WAIT%s ^(PID !NEW_PID!^)
endlocal
exit /b 0
