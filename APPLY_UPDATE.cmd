@echo off
node "%~dp0scripts\apply-update.mjs" %*
if errorlevel 1 (
 echo Update did not finish. Read the error above.
)
pause
