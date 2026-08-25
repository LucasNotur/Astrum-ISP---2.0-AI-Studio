@echo off
setlocal enabledelayedexpansion

:: ========================================================
::  install_healthcheck_monitor.bat - Registra a tarefa agendada
::  que roda healthcheck_monitor.mjs a cada 5 minutos.
::
::  ATUALIZADO 2026-08-24 (astrum-terminal-popup-healthcheck): a versao
::  anterior deste script chamava node.exe DIRETO no /tr. Como schtasks
::  sem /ru cai em logon "Interativo" por padrao (mudar pra S4U/"executar
::  sem estar conectado" exige elevacao de administrador - testado e deu
::  Acesso Negado sem admin), rodar node.exe (um app de console) nesse modo
::  abre uma janela de terminal visivel NA TELA a cada disparo - ou seja,
::  a cada 5 minutos, o dia todo. Confirmado ao vivo: reclamacao do usuario
::  de "terminal abrindo toda hora" + processo node.exe batendo exatamente
::  com o horario de disparo da tarefa.
::
::  Fix: em vez de chamar node.exe direto, chama wscript.exe (app GUI
::  subsystem, NUNCA aloca console) rodando run_healthcheck_hidden.vbs, que
::  por sua vez lanca o node.exe com WshShell.Run(..., 0, True) - o "0" pede
::  janela oculta pro processo filho. Zero elevacao necessaria, mesmo logon
::  Interativo de antes, so sem janela.
:: ========================================================

set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%..\.."
pushd "%PROJECT_ROOT%" >nul
set "PROJECT_ROOT=%CD%"
popd >nul

set "HIDDEN_LAUNCHER=%PROJECT_ROOT%\scripts\infra\run_healthcheck_hidden.vbs"

if not exist "%HIDDEN_LAUNCHER%" (
    echo X %HIDDEN_LAUNCHER% nao encontrado.
    exit /b 1
)

schtasks /create /tn "AstrumHealthMonitor" ^
    /tr "wscript.exe //B \"%HIDDEN_LAUNCHER%\"" ^
    /sc minute /mo 5 ^
    /f

if !errorlevel! neq 0 (
    echo X Falha ao criar a tarefa agendada.
    exit /b 1
)

echo + Tarefa "AstrumHealthMonitor" criada - roda a cada 5min.
echo   Log: %PROJECT_ROOT%\logs\healthcheck.log
endlocal
