#!/bin/bash
# Builds the single-file app from src/ (plain concatenation, no tooling) into docs/index.html,
# and copies the hosting files (manifest, icons, offline cache) from pwa/ into docs/.
# docs/ is what GitHub Pages serves (Settings > Pages > Deploy from a branch: main, folder /docs).
# The same docs/index.html is the offline copy in the app folder (APPS/EVEN/YYYY-MM-DD_EVEN.html).
set -e
cd "$(dirname "$0")"
mkdir -p docs
cat src/01_head.html src/02_dl_tokens.html src/03_tokens.html src/04_dl_components.html src/05_styles.html src/06_dl_effects.html src/07_effects.html src/08_body.html src/09_dl_kit.html src/10_template.html src/20_engine.html src/22_engine_plus.html src/30_ui.html src/40_book.js src/50_fs_engine.js src/60_reports.js src/62_statements.js src/64_fixed_assets.js src/70_excel.js src/72_exports.js src/74_import.js src/99_boot.js > docs/index.html
cp pwa/manifest.webmanifest pwa/sw.js pwa/icon-180.png pwa/icon-192.png pwa/icon-512.png docs/
# every script block must compile, and sw.js must carry the same build version as the page
node - <<'JS'
const fs = require('fs'), vm = require('vm');
const s = fs.readFileSync('docs/index.html', 'utf8'), sw = fs.readFileSync('docs/sw.js', 'utf8');
const re = /<script[^>]*>([\s\S]*?)<\/script>/g; let m, i = 0;
while ((m = re.exec(s))){ try { new vm.Script(m[1], { filename: 'script block ' + i }); } catch (e){ console.error('Syntax error in script block ' + i + ':\n' + e.message); process.exit(1); } i++; }
const v = (s.match(/<meta name="build" content="([^"]+)">/) || [])[1], c = (sw.match(/const CACHE = 'even-([^']+)'/) || [])[1];
if (!v){ console.error('No build version: add <meta name="build" content="YYYY-MM-DD.N"> to src/01_head.html.'); process.exit(1); }
if (v !== c){ console.error('Build version mismatch: page "' + v + '", sw.js "' + c + '". Set the same version in src/01_head.html and pwa/sw.js.'); process.exit(1); }
console.log('Built docs/index.html (' + Math.round(Buffer.byteLength(s) / 1024) + ' KB), build ' + v + ', all ' + i + ' script blocks compile.');
JS
