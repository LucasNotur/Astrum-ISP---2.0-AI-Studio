' run_healthcheck_hidden.vbs — lança healthcheck_monitor.mjs sem janela de console.
'
' Por que existe: a tarefa agendada "AstrumHealthMonitor" (ver
' install_healthcheck_monitor.bat) roda a cada 5min com logon "Interativo"
' (schtasks sem /ru cai nesse modo por padrão, e mudar pra S4U/"executar
' sem estar conectado" exige elevação de administrador, que não estava
' disponível na sessão que corrigiu isso — ver astrum-terminal-popup-healthcheck
' na memória do Claude Code). Chamar node.exe direto nesse modo abre uma janela
' de console visível a cada execução. wscript.exe é um app GUI subsystem (nunca
' aloca console) e o 2º argumento de WshShell.Run (0 = hidden) manda o processo
' filho (node.exe) também subir sem janela. True = espera terminar (assíncrono
' seria "False", mas aqui queremos que a tarefa só marque "concluída" depois
' que o healthcheck realmente rodou).
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "E:\Saas\AstrumISP"
WshShell.Run """C:\Program Files\nodejs\node.exe"" ""E:\Saas\AstrumISP\scripts\infra\healthcheck_monitor.mjs""", 0, True
