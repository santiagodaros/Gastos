@echo off
title Gestor de Gastos
echo.
echo  Iniciando Gestor de Gastos...
echo.

cd /d "%~dp0frontend"
npm run dev:full

echo.
echo  App cerrada.
pause
