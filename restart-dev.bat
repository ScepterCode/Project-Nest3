@echo off
echo Stopping any running Next.js processes...
taskkill /f /im node.exe 2>nul

echo Clearing build cache...
if exist .next rmdir /s /q .next
if exist node_modules\.cache rmdir /s /q node_modules\.cache

echo Starting development server...
npm run dev