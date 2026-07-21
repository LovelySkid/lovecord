@echo off
:: Wrapper .bat pour lancer lovecord-uninstall.ps1 facilement (double-clic)
title Lovecord — Désinstallation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0lovecord-uninstall.ps1"
if %errorlevel% neq 0 pause
