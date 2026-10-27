<img src="pwa/icon-192.png" width="96" alt="">

# EVEN

Personal double-entry bookkeeping in one offline HTML app, debit equals credit: booking with a live balance check,
journal, ledger, balance sheet, income statement, cash flow (direct and indirect), investments, fixed assets with
depreciation, twelve-month view, year comparison and closing, Excel and PDF exports. No libraries, no server, no
tracking. Three looks under Appearance (Glass, Ember, Prism), built on the Design Lab system.

The app holds no data: your books are a separate `.json` file you open in it. Save writes straight back into that
file (Chrome/Edge on a computer), opens the share sheet (iPhone, iPad: *Save to Files*) or downloads it (other
browsers). On a computer, *Save to folder* writes each day's file into a chosen app folder and moves the older ones into
a backup folder; nothing is ever deleted. Unsaved changes are kept as a working copy in the browser until the next save.
Served from GitHub Pages, the app also works offline (`pwa/sw.js`).

- App: `docs/index.html`, built from `src/` (plain concatenation) by `./build.sh`, or on Windows by double-clicking
  `build.cmd`; served by GitHub Pages from `/docs` together with the manifest and home-screen icons from `pwa/`.
- Tests: `./run_tests.sh` (Node; synthetic books of a fictional "Test Person" from `tests/make_fixture.js`). CI runs the
  interface and logic checks on every push and fails if `docs/index.html` is not the build of `src/`. With Playwright and
  Chromium installed, the same script also checks the three looks on phone and desktop and runs the Design Lab smoke test.
- Version: `src/01_head.html` (`<meta name="build">`); the app shows it at the bottom of the file menu.
- New file: start the app and choose *New*; it starts from the neutral chart of accounts in `src/10_template.html`.

## Structure

| Path | What |
|---|---|
| `src/01_head.html` | head, release notes, look before first paint, fixed app icon, build version |
| `src/02_dl_tokens.html`, `04_dl_components.html`, `06_dl_effects.html`, `09_dl_kit.html` | Design Lab kit (theme tokens, components, signature effects, theme modules + kit runtime). Copied from the kit, never edited here |
| `src/03_tokens.html`, `05_styles.html`, `07_effects.html` | EVEN's own colours, styles and effect (*The stamp*), tokens only |
| `src/08_body.html` | markup: start screen, navigation, every page, dialogs |
| `src/10_template.html` | template for new files: groups, statement structure, neutral chart of accounts |
| `src/20_engine.html`, `22_engine_plus.html` | engine: file check and repair, balances, statements, spreads, fixed assets, imports |
| `src/30_ui.html` … `99_boot.js` | interface (one closure): views, KPI cards, booking, statements engine, reports, fixed assets, Excel writer, exports, import, start |
| `pwa/` | manifest, home-screen icons and the offline cache (`sw.js`) |
| `tests/` | `make_fixture.js` (synthetic books), `checks.js` (the steps), `test_app.js` (jsdom runner), `test_ui.js` (three looks, Chromium), `smoke.js` (Design Lab) |

## Your data stays out of this repository

A GitHub Pages repository is public. Everything personal is git-ignored: `private/`, every `.json` except
`package.json`, all Excel/CSV/PDF exports, backups and any dated copy of the app. Keep your real file in `private/` if
you want the tests to run an extra open + save round trip on it locally. Before committing, the changes should list
only `src/`, `pwa/`, `docs/`, `tests/` and the files in this folder.
