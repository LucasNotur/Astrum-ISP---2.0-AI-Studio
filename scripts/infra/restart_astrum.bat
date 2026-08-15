@echo off
chcp 65001 >nul 2>nul
title Astrum — Reiniciando...

:: ══════════════════════════════════════════════════════════════
::  restart_astrum.bat — Para e reinicia todo o ambiente
:: ══════════════════════════════════════════════════════════════

echo.
echo  ========================================================
echo       ASTRUM ISP — Reiniciando Ambiente Dev
echo  ========================================================
echo.

:: Para tudo (sem pausar no final)
call "%~dp0stop_astrum_nopause.bat"

echo.
echo  Aguardando 3s antes de reiniciar...
timeout /t 3 /nobreak >nul
echo.

:: Inicia tudo
call "%~dp0start_astrum.bat"
