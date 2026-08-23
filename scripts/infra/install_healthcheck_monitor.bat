@echo off
setlocal enabledelayedexpansion

:: ========================================================
::  install_healthcheck_monitor.bat - Registra a tarefa agendada
::  que roda healthcheck_monitor.mjs a cada 5 minutos.
::
::  Diferente de AstrumBackendRun, esta tarefa NAO precisa de /it:
::  so faz fetch() (fora do backend) e schtasks/run (chamada de
::  servico, nao depende de sessao) - roda de boa em Sessao 0.
::  Rode este .bat uma vez (duplo-clique ou terminal normal).
:: ========================================================

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\.."
pushd "%PROJECT_ROOT%" >nul
set "PROJECT_ROOT=%CD%"
popd >nul

set "MONITOR_SCRIPT=%PROJECT_ROOT%\scripts\infra\healthcheck_monitor.mjs"

for /f "delims=" %%n in ('where node') do (
    set "NODE_EXE=%%n"
    goto :found_node
)
:found_node

if not defined NODE_EXE (
    echo X node.exe nao encontrado no PATH.
    exit /b 1
)

schtasks /create /tn "AstrumHealthMonitor" ^
    /tr "\"%NODE_EXE%\" \"%MONITOR_SCRIPT%\"" ^
    /sc minute /mo 5 ^
    /f

if !errorlevel! neq 0 (
    echo X Falha ao criar a tarefa agendada.
    exit /b 1
)

echo + Tarefa "AstrumHealthMonitor" criada - roda a cada 5min.
echo   Log: %PROJECT_ROOT%\logs\healthcheck.log
endlocal
