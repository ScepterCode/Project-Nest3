@echo off
echo Stopping Next.js development server...
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak >nul

echo Clearing Next.js cache...
if exist .next rmdir /s /q .next
if exist node_modules\.cache rmdir /s /q node_modules\.cache

echo Restarting development server...
npm run dev