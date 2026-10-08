@echo off
cd /d "%~dp0"
python launch.py
if errorlevel 1 (
  echo Could not start. Please install Python 3.10 or later.
  pause
)
