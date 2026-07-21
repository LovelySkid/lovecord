@echo off
:: Wrapper .bat pour lancer lovecord-install.ps1 facilement (double-clic)
title Lovecord — Installation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0lovecord-install.ps1"
if %errorlevel% neq 0 pause
