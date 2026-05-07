@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 exit /b %errorlevel%
"C:\Users\raull\OneDrive\WaitNewIdea\solon\node_modules\.bin\tauri.cmd" %*
