@echo off
rem Builds the single-file app from src\ into docs\index.html (plain byte concatenation, same as build.sh)
rem and copies the hosting files from pwa\ into docs\. Double-click it on any Windows PC: nothing to install.
cd /d "%~dp0"
if not exist docs mkdir docs
copy /b /y src\01_head.html+src\02_dl_tokens.html+src\03_tokens.html+src\04_dl_components.html+src\05_styles.html+src\06_dl_effects.html+src\07_effects.html+src\08_body.html+src\09_dl_kit.html+src\10_template.html+src\20_engine.html+src\22_engine_plus.html+src\30_ui.html+src\40_book.js+src\50_fs_engine.js+src\60_reports.js+src\62_statements.js+src\64_fixed_assets.js+src\70_excel.js+src\72_exports.js+src\74_import.js+src\99_boot.js docs\index.html >nul
if errorlevel 1 (echo Build failed. & pause & exit /b 1)
for %%f in (manifest.webmanifest sw.js icon-180.png icon-192.png icon-512.png) do copy /b /y pwa\%%f docs\%%f >nul
echo Built docs\index.html from src\. Open it in Chrome or Edge to check.
if "%~1"=="" pause
