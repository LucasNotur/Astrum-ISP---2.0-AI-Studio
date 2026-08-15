' launch_hidden.vbs - Executa um comando sem janela visivel
' Uso: wscript launch_hidden.vbs "titulo" "comando"
' O processo roda em segundo plano (sem janela, sem barra de tarefas)

Set objShell = CreateObject("WScript.Shell")
objShell.Run WScript.Arguments(1), 0, False
