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
:: ping em vez de timeout.exe - timeout recusa rodar sem stdin redirecionavel
:: ("nao ha suporte para o redirecionamento de entrada"), o que acontece tanto
:: em ferramentas de agente quanto, achado ao vivo em 2026-08-23, no PROPRIO
:: runner do GHA (silenciosamente ha sessoes - o loop abaixo virava um retry
:: quase instantaneo em vez de esperar de verdade, encurtando o orcamento real
:: de espera bem abaixo do pretendido). ping nao exige console interativo.
ping -n 2 127.0.0.1 >nul
goto :wait_port_free
:port_free

echo  [2/3] Subindo backend novo...
:: Historico (nesta ordem, cada um testado ao vivo e descartado):
::   1. wscript direto - instavel especificamente quando lancado de dentro
::      de um step do runner do GHA (nao reproduz lancado manualmente nem
::      no uso normal via start_astrum.bat). Log do Actions mostrou
::      "Cleaning up orphan processes... Terminate orphan process: pid node"
::      - o processo pertence ao Job Object do step e e morto quando ele
::      termina, mesmo lancado "hidden"/desanexado.
::   2. Agendador de Tarefas sem /it - roda em Sessao 0 (sem console),
::      pior ainda.
::   3. PowerShell Start-Process - nao testado a fundo isolado do resto.
:: Fix: Agendador de Tarefas COM /it (token interativo - roda na sessao
:: real do usuario, com console) via a tarefa "AstrumBackendRun" (criada
:: abaixo se nao existir). O processo passa a ser filho do servico do
:: Task Scheduler, nao do runner - escapa do Job Object por completo.
schtasks /query /tn "AstrumBackendRun" >nul 2>nul
if !errorlevel! neq 0 (
    schtasks /create /tn "AstrumBackendRun" /tr "%~dp0deploy_run_backend.bat" /sc once /st 23:59 /ru "%USERDOMAIN%\%USERNAME%" /it /f >nul
)
schtasks /run /tn "AstrumBackendRun" >nul

:: Orcamento 180s (nao 90s) - achado ao vivo em 2026-08-23: o boot real as vezes
:: leva 40-90s sozinho so nas reconexoes do Redis (ETIMEDOUT + retry, ioredis).
:: O timeout.exe quebrado mascarava isso ha semanas (virava retry quase instantaneo,
:: "funcionava" so quando o boot calhava de ser rapido); agora que o ping espera de
:: verdade, o orcamento antigo de 90s se mostrou apertado demais e gerou falso-negativo.
set /a "WAIT=0"
:wait_loop
ping -n 4 127.0.0.1 >nul
set /a "WAIT+=3"
curl -sf %HEALTH_BACKEND% >nul 2>nul
if !errorlevel! equ 0 goto :health_ok
if !WAIT! geq 180 (
    echo [%date% %time%] ERRO: backend nao respondeu em 180s >> "%LOG_FILE%"
    echo  X Backend nao respondeu em 180s - veja %LOG_FILE%
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
