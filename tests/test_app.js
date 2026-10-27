/* Interface tests for EVEN (accounting) in jsdom. The steps live in tests/checks.js (shared with a browser run);
   the data is the synthetic file from tests/make_fixture.js. The clock is frozen at 14.10.2026 10:00.
   Usage: node tests/test_app.js [path to a real data .json for an extra open + save round trip]          */
'use strict';
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const makeFixture = require('./make_fixture');
const runChecks = require('./checks');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'docs/index.html'), 'utf8');
const FIXED = new Date(2026, 9, 14, 10, 0, 0).getTime();

let ok = 0, bad = 0;
const check = (cond, msg) => { if (cond) ok++; else { bad++; console.log('FAIL  ' + msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* a small in-memory file system for Save to folder and the file pickers: files hold text, folders hold names → handles */
const nichtDa = () => Object.assign(new Error('not found'), { name: 'NotFoundError' });
function fakeFile(n, t){ const f = { kind: 'file', name: n, _t: t || '', getFile: async () => ({ name: n, text: async () => f._t }),
  createWritable: async () => { let s = ''; return { write: async b => { s += String(b); }, close: async () => { f._t = s; } }; },
  queryPermission: async () => 'granted', requestPermission: async () => 'granted' }; return f; }
function fakeDir(n){ const kids = new Map(); const d = { kind: 'directory', name: n, kids, gone: false,
  queryPermission: async () => 'granted', requestPermission: async () => 'granted', isSameEntry: async o => o === d,
  getFileHandle: async (x, o) => { if (d.gone) throw nichtDa(); let f = kids.get(x); if (!f){ if (!(o && o.create)) throw nichtDa(); f = fakeFile(x); kids.set(x, f); } return f; },
  getDirectoryHandle: async (x, o) => { let f = kids.get(x); if (!f){ if (!(o && o.create)) throw nichtDa(); f = fakeDir(x); kids.set(x, f); } return f; },
  removeEntry: async x => { if (!kids.delete(x)) throw nichtDa(); },
  values: () => { const it = kids.values(); return { next: async () => { if (d.gone) throw nichtDa(); return it.next(); }, [Symbol.asyncIterator](){ return this; } }; } }; return d; }
/* jsdom has no IndexedDB: one in-memory store per database name (enough for EVEN's kv store and the kit's) */
function fakeIDB(speicher){
  return { open(name){ const req = {}; setTimeout(() => { const kv = speicher[name] = speicher[name] || new Map();
    req.result = { createObjectStore(){}, transaction: () => ({ objectStore: () => ({
      get(k){ const r = {}; setTimeout(() => { r.result = kv.get(k); if (r.onsuccess) r.onsuccess(); }); return r; },
      put(v, k){ const r = {}; kv.set(k, JSON.parse(JSON.stringify(v))); setTimeout(() => { if (r.onsuccess) r.onsuccess(); }); return r; },
      delete(k){ kv.delete(k); return {}; } }) }) };
    if (req.onupgradeneeded) req.onupgradeneeded(); if (req.onsuccess) req.onsuccess(); }); return req; } };
}

function boot(o){
  o = o || {};
  const errors = [], blobs = [], names = [], sw = [], geteilt = [], gescrollt = [];
  const vc = new VirtualConsole();
  /* jsdom cannot parse some modern CSS of the Design Lab kit: not an app error */
  vc.on('jsdomError', e => { if (!/Not implemented|Could not parse CSS stylesheet/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(HTML, {
    url: 'https://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w){
      const D = w.Date;
      class FakeDate extends D { constructor(...a){ if (a.length) super(...a); else super(FIXED); } static now(){ return FIXED; } }
      w.Date = FakeDate;
      /* jsdom has no TextEncoder/TextDecoder; the Excel writer needs them */
      if (!w.TextEncoder){ const u = require('util'); w.TextEncoder = u.TextEncoder; w.TextDecoder = u.TextDecoder; }
      w.matchMedia = q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
      /* canvas: a context that accepts every call, so the background can draw */
      const ctx = new Proxy({}, { get: (t, k) => k === 'canvas' ? {} : (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) :
        (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop(){} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
      w.HTMLCanvasElement.prototype.getContext = () => ctx;
      w.URL.createObjectURL = b => { blobs.push(b); return 'blob:test/' + blobs.length; };
      w.URL.revokeObjectURL = () => {};
      w.print = () => {};
      w.scrollTo = () => {};
      w.HTMLAnchorElement.prototype.click = function(){ if (this.download) names.push(this.download); };
      w.HTMLElement.prototype.scrollIntoView = function(){};
      /* the offline cache: registrations of sw.js are recorded (jsdom cannot run it) */
      Object.defineProperty(w.navigator, 'serviceWorker', { configurable: true,
        value: { controller: null, register: u => { sw.push(u); return Promise.resolve({}); }, addEventListener(){} } });
      if (o.idb) w.indexedDB = fakeIDB(o.idb);
      /* a computer with file pickers (o.oeffne: the file the open picker returns) and, with o.ordner, Save to folder */
      if (o.oeffne){
        w.showOpenFilePicker = async () => [o.oeffne];
        w.showSaveFilePicker = async x => { const f = fakeFile(x.suggestedName); if (o.ordner) o.ordner.kids.set(f.name, f); return f; };
      }
      if (o.ordner) w.showDirectoryPicker = async () => o.ordner;
      /* an iPad: no file pickers, touch points and the share sheet (o.teilen: 'ok', or 'zu' when it is closed) */
      if (o.teilen){
        Object.defineProperty(w.navigator, 'maxTouchPoints', { configurable: true, value: 5 });
        w.navigator.canShare = x => !!(x && x.files && x.files.length);
        w.navigator.share = async x => { if (o.teilen === 'zu') throw Object.assign(new Error('closed'), { name: 'AbortError' }); geteilt.push(x.files[0]); };
        /* WebKit on iOS: the only engine with -webkit-touch-callout; scrolls are recorded */
        w.CSS = { supports: (p, v) => p === '-webkit-touch-callout' && v === 'none', escape: s => String(s) };
        w.scrollTo = (x, y) => { gescrollt.push([x, y]); };
      }
    }
  });
  return { dom, w: dom.window, d: dom.window.document, errors, blobs, names, sw, geteilt, gescrollt };
}
/* jsdom's Blob has no text()/arrayBuffer(): read it with the window's FileReader */
const readBlob = (env, b, bin) => new Promise((res, rej) => { const fr = new env.w.FileReader();
  fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); bin ? fr.readAsBinaryString(b) : fr.readAsText(b); });

function harness(env){
  return {
    w: env.w, d: env.d, sleep, check,
    /* no File System Access API in jsdom: the app opens through the hidden file input */
    async openJson(text, name){
      env.d.getElementById('s-oeffnen').click(); await sleep(30);
      const inp = env.d.getElementById('dateiwahl');
      Object.defineProperty(inp, 'files', { configurable: true, value: [{ name, text: () => Promise.resolve(text) }] });
      inp.onchange(); await sleep(60);
    },
    async lastBlob(){
      const b = env.blobs[env.blobs.length - 1];
      if (!b) return { text: '', bin: '' };
      return { text: await readBlob(env, b), bin: await readBlob(env, b, true) };
    }
  };
}

(async () => {
  const env = boot(); await sleep(50);
  const fixture = makeFixture(env.w.VORLAGE);
  await runChecks(harness(env), fixture);
  check(env.d.querySelector('#dmenu [data-aktion="diag"]').hidden && !env.d.querySelector('.ev-diag'), 'computer: no iPad diagnostics in the file menu');

  /* optional: a real data file (private/, never in the repository): open, every page, save, nothing lost */
  const real = process.argv[2];
  if (real && fs.existsSync(real)){
    const env2 = boot(); await sleep(50);
    const txt = fs.readFileSync(real, 'utf8'), rd = JSON.parse(txt), h = harness(env2);
    await h.openJson(txt, path.basename(real));
    for (const b of env2.d.querySelectorAll('#nav button')){ b.click(); await sleep(30); }
    env2.d.getElementById('speichern').click(); await sleep(400);
    const back = await h.lastBlob();
    let rs = null; try { rs = JSON.parse(back.text); } catch (e) {}
    check(rs && rs.buchungen.length === rd.buchungen.length, 'real data: every booking survives open + save (' + rd.buchungen.length + ')');
    check(rs && rs.konten.length === rd.konten.length, 'real data: chart of accounts unchanged');
    env.errors.push(...env2.errors);
  }

  /* Design Lab remodel (24.10.2026): KPI cards, the look in the file, file names, build version, donuts, net worth dots */
  {
    const e3 = boot(); await sleep(50); const h3 = harness(e3), d = e3.d, $ = s => d.querySelector(s), $$ = s => Array.from(d.querySelectorAll(s));
    const fx = makeFixture(e3.w.VORLAGE);
    /* three fixed assets on the books, registered */
    fx.buchungen.push({ id: 'fa1', datum: '2025-03-10', beleg: '', text: 'Laptop', z: [['1500', 2400, 0], ['1020', 0, 2400]] },
                      { id: 'fa2', datum: '2026-02-15', beleg: '', text: 'Sofa', z: [['1510', 3200, 0], ['1020', 0, 3200]] });
    fx.anlagen = [{ id: 'a1', text: 'Laptop', konto: '1500', aufwand: '6800', datum: '2025-03-10', start: '2025-03', monate: 36, kosten: 2400, restwert: 0 },
                  { id: 'a2', text: 'Sofa', konto: '1510', aufwand: '6800', datum: '2026-02-15', start: '2026-02', monate: 60, kosten: 3200, restwert: 0 }];
    /* an ETF savings plan with a valuation account (the template's English names) */
    fx.buchungen.push({ id: 'etf1', datum: '2026-01-27', beleg: '', text: 'ETF savings plan', z: [['1400', 400, 0], ['1020', 0, 400]] },
                      { id: 'etf2', datum: '2026-03-31', beleg: '', text: 'ETF valuation', z: [['1400.1', 12, 0], ['6955', 0, 12]] });
    fx.settings = { theme: 'glass' };
    await h3.openJson(JSON.stringify(fx), '2026-10-01_EVEN.json'); await sleep(120);
    for (let k = 0; k < 2; k++){ const q = $('#dlg-frage.on #fr-knoepfe button'); if (q){ q.click(); await sleep(60); } }
    check(d.documentElement.dataset.theme === 'glass', 'opening a file applies its look');
    const tab = async id => { $('#nav button[data-tab="' + id + '"]').click(); await sleep(60); };
    await tab('uebersicht');
    const kpis = $$('#kpis .kpi');
    check(kpis.map(k => k.querySelector('.kpi__label').textContent).join('|') === 'Income|Expenses|Result|Net worth|Equity ratio|Bookings', 'Overview: six KPI cards (' + kpis.length + ')');
    check(kpis.every(k => k.querySelector('svg.spark')), 'every KPI card has its line');
    check(kpis.slice(0, 3).every(k => k.querySelector('.delta') && /vs 2025$/.test(k.querySelector('.kpi__foot').textContent)), 'income, expenses, result compared with 2025');
    check(!$('#kpis .delta--down'), 'no red deltas');
    const ex = kpis[1] && kpis[1].querySelector('.delta');
    check(ex && (ex.textContent.charAt(0) === '+' ? ex.classList.contains('delta--flat') : ex.classList.contains('delta--up')), 'lower expenses count as better, higher as neutral');
    /* the look: never an unsaved change, written into the file */
    e3.w.Kit.set('ember', 'user'); await sleep(40);
    check($('#speichern').textContent.trim() === 'Saved', 'changing the look is not an unsaved change');
    $('#speichern').click(); await sleep(400);
    const saved = JSON.parse((await h3.lastBlob()).text || '{}');
    check(saved.settings && saved.settings.theme === 'ember', 'the look is written into the data file');
    check(/^2026-10-14T\d\d:\d\d:\d\d/.test(saved.saved || ''), 'the file carries the moment it was saved (' + saved.saved + ')');
    check(e3.sw.includes('sw.js'), 'hosted: the offline cache (sw.js) is registered');
    check(e3.names[e3.names.length - 1] === '2026-10-14_EVEN.json', 'data file named YYYY-MM-DD_EVEN.json (got ' + e3.names[e3.names.length - 1] + ')');
    $('#dmenu [data-aktion="kopie"]').click(); await sleep(400);
    check(e3.names[e3.names.length - 1] === '2026-10-14_EVEN COPY.json', 'dated copy named YYYY-MM-DD_EVEN COPY.json (got ' + e3.names[e3.names.length - 1] + ')');
    const ver = $('meta[name="build"]').getAttribute('content');
    check(/^\d{4}-\d\d-\d\d\.\d+$/.test(ver) && $('#buildzeile').textContent === 'EVEN · build ' + ver, 'file menu shows the build version ' + ver);
    check(!e3.w.Kit.isOn('ledger') && !/fx-ledger/.test(d.documentElement.innerHTML), 'no ledger lines');
    /* fixed assets: a donut that turns, one slice per asset */
    await tab('sachanlagen');
    check($$('#sa-donut .ev-spin .seg').length === 2 && $$('#sa-donut .donut__list > div').length === 2, 'fixed assets: donut with one slice per asset');
    check($$('#sa-register tbody tr.ev-klick').length === 2, 'fixed assets: both assets in the register');
    /* investments detected from English account names: "net deposits" is no rent deposit, "unrealised" is the valuation */
    await tab('fsmapping');
    const etf = $$('#fs-inv tbody tr').find(tr => /^1400$/.test((tr.querySelector('td.nr') || {}).textContent || ''));
    check(etf && etf.querySelector('input[type="checkbox"]').checked && etf.querySelector('select').value === '1400.1' && etf.querySelector('input.ev-cell').value === 'ETF portfolio',
      'Statement settings: the ETF portfolio is detected, on the charts, with 1400.1 as its valuation account');
    e3.dom.window.close();
  }
  {
    /* iPhone and iPad: Save hands the file to the share sheet ("Save to Files" picks the folder), no download;
       closing the share sheet saves nothing and the change stays unsaved */
    const o = { teilen: 'ok' }, e = boot(o); await sleep(50); const h = harness(e), d = e.d, $ = s => d.querySelector(s);
    const fire = (el, typ, init) => el.dispatchEvent(typ === 'keydown' ? new e.w.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init)) : new e.w.Event(typ, { bubbles: true }));
    const tippe = (sel, wert) => { const el = $(sel); el.focus(); el.value = wert; fire(el, 'input'); return el; };
    await h.openJson(JSON.stringify(makeFixture(e.w.VORLAGE)), '2026-10-01_EVEN.json'); await sleep(120);
    for (let k = 0; k < 2; k++){ const q = $('#dlg-frage.on #fr-knoepfe button'); if (q){ q.click(); await sleep(60); } }
    $('#nav button[data-tab="buchen"]').click(); await sleep(40);
    tippe('#bu-text', 'Share sheet test'); tippe('#bu-betrag', '12');
    fire(tippe('#bu-soll', '4000'), 'keydown', { key: 'Tab' }); fire(tippe('#bu-haben', '1020'), 'keydown', { key: 'Tab' }); await sleep(10);
    $('#bu-ok').click(); await sleep(60);
    const meldung = () => $('#meldungen').textContent;
    o.teilen = 'zu'; $('#speichern').click(); await sleep(400);
    check(!e.geteilt.length && !e.names.length && $('#speichern').textContent.trim() !== 'Saved' && /share sheet was closed/.test(meldung()),
      'iPad: closing the share sheet saves nothing, the booking stays unsaved');
    o.teilen = 'ok'; $('#speichern').click(); await sleep(400);
    const f = e.geteilt[0], back = f ? JSON.parse(await readBlob(e, f) || '{}') : {};
    check(e.geteilt.length === 1 && f.name === '2026-10-14_EVEN.json' && f.type === 'application/json' && !e.names.length,
      'iPad: Save opens the share sheet with 2026-10-14_EVEN.json, no download (got ' + (f && f.name) + ')');
    check((back.buchungen || []).some(b => b.text === 'Share sheet test') && $('#speichern').textContent.trim() === 'Saved' && /Shared as 2026-10-14_EVEN\.json/.test(meldung()),
      'iPad: the shared file holds the new booking and the window is saved');
    /* the page jumping while typing: the keyboard going away places the page again, a move between fields does not */
    const vorher = e.gescrollt.length;
    $('#bu-text').focus(); $('#bu-betrag').focus(); await sleep(200);
    const zwischen = e.gescrollt.length;
    $('#bu-betrag').blur(); await sleep(200);
    check(zwischen === vorher && e.gescrollt.length === vorher + 1, 'iPad: leaving the last field places the page again, moving between fields does not');
    const css = Array.from(d.querySelectorAll('style')).map(s => s.textContent).join('\n');
    const ios = (css.match(/@supports \(-webkit-touch-callout:none\)\{[\s\S]*?\n\}/) || [''])[0];
    check(/html\{scroll-behavior:auto;scroll-padding-top:0\}/.test(ios) && /\.ev,\.ev-start\{overflow-x:clip\}/.test(ios) && /\.ev-side\{height:100dvh\}/.test(ios) && /font-size:16px/.test(ios),
      'iPad: the iOS-only styles (no smooth scroll or top offset, clip on the shell, 100dvh, 16px fields) are in the page');
    /* iPadOS 26 with a keyboard attached: a scroll right after a typed key in a field in view is undone; after Tab, after
       a while or with a finger on the screen it stays */
    const iosScroll = y => { Object.defineProperty(e.w, 'scrollY', { configurable: true, writable: true, value: y }); e.w.dispatchEvent(new e.w.Event('scroll')); };
    const taste = (sel, key) => { const el = $(sel); el.focus(); el.dispatchEvent(new e.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); };
    let n = e.gescrollt.length;
    taste('#bu-text', 'a'); iosScroll(240);
    const zurueck = e.gescrollt.slice(n);
    check(zurueck.length === 1 && zurueck[0][1] === 0, 'iPad: the page scrolled up right after a typed key goes back (' + JSON.stringify(zurueck) + ')');
    iosScroll(0); n = e.gescrollt.length;
    taste('#bu-text', 'Tab'); iosScroll(240);
    check(e.gescrollt.length === n, 'iPad: a scroll after Tab stays');
    iosScroll(0); taste('#bu-text', 'b'); await sleep(450); n = e.gescrollt.length; iosScroll(240);
    check(e.gescrollt.length === n, 'iPad: a scroll a while after the key stays');
    iosScroll(0); taste('#bu-text', 'c'); d.dispatchEvent(new e.w.Event('touchstart')); n = e.gescrollt.length; iosScroll(240);
    check(e.gescrollt.length === n, 'iPad: a scroll with a finger on the screen stays');
    d.dispatchEvent(new e.w.Event('touchend')); iosScroll(0);
    /* the diagnostics: in the file menu on iPhone and iPad, a log that names no typed character */
    const dm = $('#dmenu [data-aktion="diag"]');
    check(dm && !dm.hidden, 'iPad: the file menu offers the iPad diagnostics');
    dm.click(); await sleep(20);
    taste('#bu-text', 'x'); iosScroll(120);
    const box = $('.ev-diag');
    check(box && /iOS \?/.test(box.textContent) && /undo 120/.test(box.textContent) && / key /.test(box.textContent) && !/\bx\b/.test(box.textContent.split('\n').slice(1).join(' ').replace(/\d+×\d+/g, '')),
      'iPad: the diagnostics log the key (not which), the undone scroll and the viewport');
    iosScroll(0); dm.click(); await sleep(20);
    check(!$('.ev-diag'), 'iPad: the diagnostics switch off again');
    e.dom.window.close();
  }
  {
    /* Overview (Years): more than 40 months of reports: the net worth line keeps only the latest dot */
    const e4 = boot(); await sleep(50); const h4 = harness(e4), d = e4.d, $ = s => d.querySelector(s);
    const fx = makeFixture(e4.w.VORLAGE);
    for (let j = 2021; j <= 2024; j++) for (let m = 1; m <= 12; m++){ const t = j + '-' + String(m).padStart(2, '0') + '-25';
      fx.buchungen.push({ id: 'x' + j + m, datum: t, beleg: '', text: 'Salary', z: [['1020', 5000, 0], ['3000', 0, 5000]] }); }
    await h4.openJson(JSON.stringify(fx), 'long.json'); await sleep(120);
    for (let k = 0; k < 2; k++){ const q = $('#dlg-frage.on #fr-knoepfe button'); if (q){ q.click(); await sleep(60); } }
    $('#nav button[data-tab="ueberjahre"]').click(); await sleep(150);
    const dots = d.querySelectorAll('#oj-linie circle.ev-dot').length;
    check(dots <= 1, 'net worth line with many months: no row of beads (' + dots + ' dots)');
    e4.dom.window.close();
  }

  /* Safety round 25.10.2026: offline cache, saved elsewhere, Save to folder, working copy */
  {
    const swText = fs.readFileSync(path.join(ROOT, 'docs/sw.js'), 'utf8'), ver = /<meta name="build" content="([^"]+)">/.exec(HTML)[1];
    check(swText.includes("const CACHE = 'even-" + ver + "'"), 'sw.js cache carries the build version ' + ver);
    check(/k\.startsWith\('even-'\) && k !== CACHE/.test(swText), 'sw.js clears only its own caches (the origin is shared with CICO and RISE)');
    const fxText = e => JSON.stringify(makeFixture(e.w.VORLAGE));
    const frageTitel = e => e.d.getElementById('dlg-frage').classList.contains('on') ? e.d.getElementById('fr-titel').textContent : '';
    const knopf = (e, t) => Array.from(e.d.querySelectorAll('#dlg-frage.on #fr-knoepfe button')).find(b => b.textContent === t);
    const wegklicken = async e => { for (let k = 0; k < 2; k++){ const q = e.d.querySelector('#dlg-frage.on #fr-knoepfe button'); if (q){ q.click(); await sleep(60); } } };
    const namen = dd => Array.from(dd.kids.keys()).sort().join('|');

    /* 1. writing back into the opened file: saved elsewhere since it was opened → ask first */
    const DISK = '2026-10-14_EVEN.json', datei = fakeFile(DISK);
    const e5 = boot({ oeffne: datei }); await sleep(50);
    datei._t = fxText(e5);
    e5.d.getElementById('s-oeffnen').click(); await sleep(150); await wegklicken(e5);
    check(e5.d.getElementById('dateiname').textContent === DISK, 'computer: the books open through the file picker');
    const ANDERSWO = '2026-10-14T06:00:00.000Z', aufDisk = () => JSON.parse(datei._t).saved;
    { const x = JSON.parse(datei._t); x.saved = ANDERSWO; datei._t = JSON.stringify(x); }
    e5.d.getElementById('speichern').click(); await sleep(400);
    check(frageTitel(e5) === 'Saved elsewhere since you opened it', 'saved elsewhere since it was opened: Save asks first');
    if (knopf(e5, 'Cancel')) knopf(e5, 'Cancel').click(); await sleep(60);
    check(aufDisk() === ANDERSWO, 'Cancel leaves the other version untouched');
    e5.d.getElementById('speichern').click(); await sleep(400);
    if (knopf(e5, 'Replace it')) knopf(e5, 'Replace it').click(); await sleep(400);
    check(aufDisk() !== ANDERSWO && JSON.parse(datei._t).buchungen.length === JSON.parse(fxText(e5)).buchungen.length, 'Replace it writes this window’s version, every booking in it');
    e5.d.getElementById('speichern').click(); await sleep(400);
    check(!frageTitel(e5), 'the next save goes straight in (nothing saved elsewhere since)');

    /* 2. Save to folder: today's file into the app folder, the one it replaces into 02 BACKUP, nothing deleted */
    const app = fakeDir('EVEN'), bkp = fakeDir('02 BACKUP'); app.kids.set('02 BACKUP', bkp);
    const gestern = fakeFile('2026-10-13_EVEN.json'); app.kids.set(gestern.name, gestern); app.kids.set('notes.md', fakeFile('notes.md', '# pointer'));
    const e6 = boot({ oeffne: gestern, ordner: app }); await sleep(50);
    { const x = JSON.parse(fxText(e6)); x.saved = '2026-10-13T19:00:00.000Z'; gestern._t = JSON.stringify(x); }
    e6.d.getElementById('s-oeffnen').click(); await sleep(150); await wegklicken(e6);
    check(!e6.d.getElementById('ordner').hidden, 'Save to folder button on a computer');
    e6.d.getElementById('ordner').click(); await sleep(30);
    e6.d.getElementById('od-app').click(); await sleep(200);
    check(/Backups go to “02 BACKUP”/.test(e6.d.getElementById('meldungen').textContent), 'Save to folder: choosing the app folder finds its 02 BACKUP by itself');
    if (knopf(e6, 'Save now')) knopf(e6, 'Save now').click(); await sleep(500);
    check(namen(app) === '02 BACKUP|2026-10-14_EVEN.json|notes.md' && namen(bkp) === '2026-10-13_EVEN.json',
      'today’s file goes into the app folder, the one it replaces into 02 BACKUP, nothing else is touched (' + namen(app) + ' / ' + namen(bkp) + ')');
    e6.d.getElementById('speichern').click(); await sleep(500);
    check(!frageTitel(e6) && namen(app) === '02 BACKUP|2026-10-14_EVEN.json|notes.md', 'saving again the same day goes straight into today’s file');
    { const fh = app.kids.get('2026-10-14_EVEN.json'), x = JSON.parse(fh._t); x.saved = '2026-10-14T05:00:00.000Z'; fh._t = JSON.stringify(x); }
    e6.d.getElementById('speichern').click(); await sleep(400);
    check(frageTitel(e6) === 'Today’s file is already there', 'today’s file that is not this window’s version: Save asks first');
    if (knopf(e6, 'Replace it')) knopf(e6, 'Replace it').click(); await sleep(500);
    check(namen(bkp) === '2026-10-13_EVEN.json|2026-10-14_EVEN.json', 'Replace it: the old one goes to 02 BACKUP first, nothing is deleted (' + namen(bkp) + ')');
    app.gone = true;
    e6.d.getElementById('speichern').click(); await sleep(400);
    check(/cannot be found any more/.test(e6.d.getElementById('meldungen').textContent) && frageTitel(e6) === 'Save to folder', 'a folder that was moved or renamed: EVEN says so and asks for it again');

    /* 3. the working copy: unsaved changes survive a closed tab; the start screen offers them and asks before another file replaces them */
    const speicher = {};
    const e7 = boot({ idb: speicher }); await sleep(50);
    /* opening first asks the (simulated) IndexedDB for a working copy: give it time before the file input is used */
    e7.d.getElementById('s-oeffnen').click(); await sleep(150);
    { const inp = e7.d.getElementById('dateiwahl'), t = fxText(e7);
      Object.defineProperty(inp, 'files', { configurable: true, value: [{ name: '2026-10-14_EVEN.json', text: () => Promise.resolve(t) }] });
      inp.onchange(); await sleep(120); }
    await wegklicken(e7);
    const m7 = e7.d.getElementById('mandant'); m7.value = 'Renamed person'; m7.dispatchEvent(new e7.w.Event('change', { bubbles: true })); await sleep(30);
    Object.defineProperty(e7.d, 'hidden', { configurable: true, get: () => true });
    e7.d.dispatchEvent(new e7.w.Event('visibilitychange')); await sleep(80);
    const ak = speicher.buchhaltung && speicher.buchhaltung.get('arbeitskopie');
    check(!!ak && ak.daten && ak.daten.mandant === 'Renamed person', 'going to the background keeps a working copy of the unsaved changes');
    const e8 = boot({ idb: speicher }); await sleep(120);
    const weiter = e8.d.getElementById('s-weiter');
    check(!!weiter && /Restore unsaved changes/.test(weiter.textContent), 'the start screen offers the unsaved changes');
    /* without file pickers (Safari, iPhone) the browser's picker opens inside the tap; the question follows the choice */
    e8.d.getElementById('s-oeffnen').click(); await sleep(20);
    check(!frageTitel(e8), 'no file pickers: Open starts the browser picker at once, no question before it');
    { const inp = e8.d.getElementById('dateiwahl'), t = fxText(e8);
      Object.defineProperty(inp, 'files', { configurable: true, value: [{ name: 'other.json', text: () => Promise.resolve(t) }] });
      inp.onchange(); await sleep(120); }
    check(frageTitel(e8) === 'Drop the unsaved changes?', 'opening another file over them asks first (after the choice)');
    if (knopf(e8, 'Cancel')) knopf(e8, 'Cancel').click(); await sleep(40);
    if (weiter) weiter.click(); await sleep(200); await wegklicken(e8);
    check(e8.d.getElementById('mandant').value === 'Renamed person' && e8.d.getElementById('speichern').textContent.trim() === 'Save', 'Restore brings them back, Save blinks');
    e8.d.getElementById('speichern').click(); await sleep(400);
    check(!speicher.buchhaltung.get('arbeitskopie'), 'after a save the working copy is gone');

    /* 4. one save at a time (build .4), with Save to folder: Save clicked twice on a new day, a change made while saving */
    const app9 = fakeDir('EVEN'), bkp9 = fakeDir('02 BACKUP'); app9.kids.set('02 BACKUP', bkp9);
    const vortag = fakeFile('2026-10-13_EVEN.json'); app9.kids.set(vortag.name, vortag);
    const e9 = boot({ oeffne: vortag, ordner: app9 }); await sleep(50);
    { const x = JSON.parse(fxText(e9)); x.saved = '2026-10-13T19:00:00.000Z'; vortag._t = JSON.stringify(x); }
    e9.d.getElementById('s-oeffnen').click(); await sleep(150); await wegklicken(e9);
    e9.d.getElementById('ordner').click(); await sleep(30);
    e9.d.getElementById('od-app').click(); await sleep(200);
    if (knopf(e9, 'Close')) knopf(e9, 'Close').click(); await sleep(40);
    const m9 = e9.d.getElementById('mandant'), nenne9 = t => { m9.value = t; m9.dispatchEvent(new e9.w.Event('change', { bubbles: true })); };
    nenne9('Saved with a double click'); await sleep(30);
    e9.d.getElementById('speichern').click(); e9.d.getElementById('speichern').click(); await sleep(500);
    check(!/Not saved/.test(e9.d.getElementById('meldungen').textContent) && namen(app9) === '02 BACKUP|2026-10-14_EVEN.json' && namen(bkp9) === '2026-10-13_EVEN.json',
      'Save clicked twice on a new day: saved once, the old file in 02 BACKUP, no false error (' + namen(app9) + ' / ' + namen(bkp9) + ')');
    nenne9('Saved'); await sleep(30);
    e9.d.getElementById('speichern').click(); nenne9('Changed while saving'); await sleep(500);
    const heute9 = () => JSON.parse(app9.kids.get('2026-10-14_EVEN.json')._t).mandant;
    check(heute9() === 'Saved' && e9.d.getElementById('speichern').textContent.trim() === 'Save', 'a change made while saving to the folder stays unsaved');
    e9.d.getElementById('speichern').click(); await sleep(500);
    check(!frageTitel(e9) && heute9() === 'Changed while saving' && e9.d.getElementById('speichern').textContent.trim() === 'Saved', 'the next save goes straight into today’s file, with the change');
    env.errors.push(...e5.errors, ...e6.errors, ...e7.errors, ...e8.errors, ...e9.errors);
  }

  check(env.errors.length === 0, 'no script errors' + (env.errors.length ? ': ' + env.errors.slice(0, 3).join(' | ') : ''));
  console.log((bad ? 'FAILED ' : 'OK ') + ok + ' of ' + (ok + bad) + ' checks passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
