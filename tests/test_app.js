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
      getAllKeys(){ const r = {}; setTimeout(() => { r.result = Array.from(kv.keys()); if (r.onsuccess) r.onsuccess(); }); return r; },
      delete(k){ kv.delete(k); return {}; } }) }) };
    if (req.onupgradeneeded) req.onupgradeneeded(); if (req.onsuccess) req.onsuccess(); }); return req; } };
}

/* the working copies in a simulated IndexedDB: one per window ("arbeitskopie:<window>"; "arbeitskopie" from 27.7) */
const kopien = sp => Array.from(((sp || {}).buchhaltung || new Map()).keys()).filter(k => /^arbeitskopie/.test(k));
const kopie = sp => { const k = kopien(sp)[0]; return k ? sp.buchhaltung.get(k) : null; };
function boot(o){
  o = o || {};
  const errors = [], blobs = [], names = [], sw = [], geteilt = [], meineLocks = [];
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
      /* Web Locks shared by the windows of one browser (o.locks: a Set of held names); a window that is closed or
         crashes releases its own (env.freigeben) */
      if (o.locks) Object.defineProperty(w.navigator, 'locks', { configurable: true, value: {
        request: (n, f) => { o.locks.add(n); meineLocks.push(n); return Promise.resolve().then(f); },
        query: async () => ({ held: Array.from(o.locks).map(name => ({ name })) }) } });
      /* a computer with file pickers (o.oeffne: the file the open picker returns; o.speichereIn: the file the save picker
         returns, else a new one) and, with o.ordner, Save to folder */
      if (o.oeffne){
        w.showOpenFilePicker = async () => [o.oeffne];
        w.showSaveFilePicker = async x => { if (o.speichereIn) return o.speichereIn; const f = fakeFile(x.suggestedName); if (o.ordner) o.ordner.kids.set(f.name, f); return f; };
      }
      if (o.ordner) w.showDirectoryPicker = async () => o.ordner;
      /* an iPad: no file pickers, touch points and the share sheet (o.teilen: 'ok', or 'zu' when it is closed) */
      if (o.teilen){
        Object.defineProperty(w.navigator, 'maxTouchPoints', { configurable: true, value: 5 });
        w.navigator.canShare = x => !!(x && x.files && x.files.length);
        w.navigator.share = async x => { if (o.teilen === 'zu') throw Object.assign(new Error('closed'), { name: 'AbortError' });
          if (o.teilen === 'nein') throw Object.assign(new Error('Not allowed'), { name: 'NotAllowedError' }); geteilt.push(x.files[0]); };
      }
    }
  });
  return { dom, w: dom.window, d: dom.window.document, errors, blobs, names, sw, geteilt, freigeben: () => meineLocks.forEach(n => o.locks.delete(n)) };
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
    const ak = kopie(speicher);
    check(!!ak && ak.daten && ak.daten.mandant === 'Renamed person' && /^arbeitskopie:\w+$/.test(kopien(speicher)[0]), 'going to the background keeps a working copy of the unsaved changes (this window’s own)');
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
    const vorRestore = kopien(speicher)[0];
    if (weiter) weiter.click(); await sleep(60);
    check(kopien(speicher).length === 1 && kopien(speicher)[0] !== vorRestore && kopie(speicher).daten.mandant === 'Renamed person',
      'Restore: this window keeps them at once under its own name, then the old copy goes (never a moment without one)');
    await sleep(140); await wegklicken(e8);
    check(e8.d.getElementById('mandant').value === 'Renamed person' && e8.d.getElementById('speichern').textContent.trim() === 'Save', 'Restore brings them back, Save blinks');
    e8.d.getElementById('speichern').click(); await sleep(400);
    check(!kopien(speicher).length, 'after a save the working copy is gone');

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

  /* Final review 28.10.2026: every finding of the audit, as it was found (each of these failed on build 2026-10-27.7) */
  {
    /* typing into a missing field never crashes the run: its step fails and the next ones still run */
    const T = e => { const d = e.d, $ = s => d.querySelector(s), $$ = s => Array.from(d.querySelectorAll(s));
      const fire = (el, typ, init) => el.dispatchEvent(typ === 'keydown' ? new e.w.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init)) : new e.w.Event(typ, { bubbles: true }));
      return { d, $, $$, fire, st: () => e.w.__buha.state, E: e.w.__buha.E,
        tippe: (el, v) => { if (typeof el === 'string') el = $(el); if (!el) return d.createElement('input'); el.focus(); el.value = v; fire(el, 'input'); return el; },
        frage: () => $('#dlg-frage').classList.contains('on') ? $('#fr-titel').textContent : '',
        knopf: t => $$('#dlg-frage.on #fr-knoepfe button').find(b => b.textContent === t),
        modal: t => $$('.overlay:not(.is-closing) .modal__actions button').find(b => b.textContent === t),
        meldung: () => $('#meldungen').textContent, leeren: () => $$('#meldungen .toast').forEach(t => t.remove()),
        weg: async () => { for (let k = 0; k < 2; k++){ const q = $('#dlg-frage.on #fr-knoepfe button'); if (q){ q.click(); await sleep(60); } } },
        seite: async id => { $('#nav button[data-tab="' + id + '"]').click(); await sleep(60); },
        nenne: v => { const m = $('#mandant'); m.value = v; fire(m, 'change'); },
        knopfText: () => $('#speichern').textContent.trim(),
        saldo: (nr, bis) => Math.round((e.w.__buha.E.saldoPer(e.w.__buha.state, bis)[nr] || 0) * 100) / 100 }; };
    const offen = async (e, fx, name) => { const h = harness(e); await h.openJson(JSON.stringify(fx), name || '2026-10-01_EVEN.json'); await sleep(120); await T(e).weg(); return T(e); };
    /* a laptop bought on 10.03.2025 on 1500, contra 1509, expense 6801, 36 months; 2025's ten months booked (666.70) */
    const mitLaptop = (V, zu) => { const fx = makeFixture(V);
      fx.buchungen.push({ id: 'fa1', datum: '2025-03-10', beleg: '', text: 'Laptop', z: [['1500', 2400, 0], ['1020', 0, 2400]] });
      for (let i = 0; i < 10; i++){ const m = 3 + i, ym = '2025-' + String(m).padStart(2, '0');
        fx.buchungen.push({ id: 'dp' + i, datum: ym + '-' + new Date(Date.UTC(2025, m, 0)).getUTCDate(), beleg: '', text: 'Laptop, depreciation (' + (i + 1) + '/36)',
          z: [['6801', 66.67, 0], ['1509', 0, 66.67]], plan: { id: 'a1', rolle: 'abschreibung', ab: i + 1, nr: i + 1, von: 36, monat: ym } }); }
      fx.anlagen = [{ id: 'a1', text: 'Laptop', konto: '1500', wb: '1509', aufwand: '6801', datum: '2025-03-10', start: '2025-03', ab: '2025-03', monate: 36, kosten: 2400, restwert: 0 }];
      if (zu) fx.abgeschlossen = [2025];
      return fx; };
    const alle = [];

    /* 1. a fixed asset corrected below what a closed year already depreciated: refused with the reason, never a
       negative depreciation (27.7: twelve negative bookings, then every Save failed) */
    { const e = boot(); alle.push(e); await sleep(50); const t = await offen(e, mitLaptop(e.w.VORLAGE, true));
      e.w.__buha.anlageDialog({ id: 'a1' }); await sleep(60);
      t.tippe('#an-kosten', '240'); await sleep(20);
      const ok = t.modal('Save and rebook');
      check(ok && ok.disabled && /Already depreciated: 666\.70/.test(t.$('.ev-an-preview').textContent),
        'fixed asset: a cost below the depreciation of the closed year is refused, with the reason');
      check(!t.st().buchungen.some(b => b.z.some(z => z[1] < 0 || z[2] < 0)), 'fixed asset: no booking with a negative amount');
      const zu = t.modal('Cancel'); if (zu) zu.click(); await sleep(250);
      /* 2. removing it from the register works although 2025 is closed; the closed bookings stay as they are */
      await t.seite('sachanlagen');
      t.$('#sa-register button[aria-label^="Remove"]').click(); await sleep(60);
      check(/booking.? in closed years stay as they are/.test(t.$('#fr-text').textContent), 'removing an asset: the question says the closed years stay as they are');
      const wahl = t.knopf('Remove') || t.knopf('Keep the bookings'); if (wahl) wahl.click(); await sleep(80);
      check(!(t.st().anlagen || []).length && t.st().buchungen.filter(b => b.plan && b.plan.id === 'a1').length === 10 && !/Not done/.test(t.meldung()),
        'an asset with depreciation in a closed year can be removed from the register; its closed bookings are untouched');
    }
    /* 3. a sold asset: no Edit (27.7: editing it rebooked the depreciation, not the sale; 1509 kept a balance) */
    { const e = boot(); alle.push(e); await sleep(50); const t = await offen(e, mitLaptop(e.w.VORLAGE, false));
      await t.seite('sachanlagen');
      t.$$('#sa-register button').find(b => b.textContent === 'Edit').click(); await sleep(60);
      t.modal('Save and rebook').click(); await sleep(250);
      t.$$('#sa-register button').find(b => b.textContent === 'Sell').click(); await sleep(60);
      t.tippe('#ab-datum', '30.06.2026'); t.tippe('#ab-erloes', '500'); await sleep(20);
      t.modal('Book the disposal').click(); await sleep(250);
      check(t.saldo('1500', '2026-12-31') === 0 && t.saldo('1509', '2026-12-31') === 0, 'sold: asset and contra account at zero');
      check(!t.$$('#sa-register button').some(b => b.textContent === 'Edit' || b.textContent === 'Sell'), 'a sold asset has no Edit and no Sell');
      t.leeren(); e.w.__buha.anlageDialog({ id: 'a1' }); await sleep(60);
      check(!t.modal('Save and rebook') && /is sold/.test(t.meldung()), 'a sold asset’s dialog does not open: its schedule stays as it was sold');
    }
    /* 4. the closed-year guard: a closed year's closing never changes while it is closed (27.7: removing the imported
       closing changed the closed 2025), and years close and reopen in order */
    { const e = boot(); alle.push(e); await sleep(50);
      const fx = makeFixture(e.w.VORLAGE); fx.buchungen = fx.buchungen.filter(b => !b.eb);
      fx.vergleichsjahre = [{ jahr: 2024, quelle: 'Import', importiert: '2025-01-05', salden: { '1020': 6200, '1021': 15000, '1000': 300, '2800': -21500 } }];
      fx.abgeschlossen = [2025];
      const t = await offen(e, fx);
      const vor = t.saldo('1021', '2025-12-31');
      await t.seite('vergleich'); t.leeren();
      t.$$('#vg-liste button').find(b => b.textContent === 'Remove').click(); await sleep(60);
      if (t.knopf('Remove')) t.knopf('Remove').click(); await sleep(80);
      check(t.st().vergleichsjahre.length === 1 && t.saldo('1021', '2025-12-31') === vor && /closing of 2025, a closed year/.test(t.meldung()),
        'closed 2025: removing the imported closing it opens from is refused (' + vor + ' stays)');
      await t.seite('konten'); t.leeren();
      const gv = t.$('#kt-system select[aria-label="Equity at the beginning"]'), anderes = Array.from(gv.options).find(o => o.value && o.value !== '2800');
      gv.value = anderes.value; t.fire(gv, 'change'); await sleep(40);
      check(t.st().einstellungen.gewinnvortrag === '2800' && /closed year/.test(t.meldung()), 'closed 2025: another equity account for the opening is refused');
      t.leeren();
      const g1021 = t.$('select[aria-label="Group of 1021"]'), erG = e.w.VORLAGE.gruppen.find(g => g.s === 'E').c;
      g1021.value = erG; t.fire(g1021, 'change'); await sleep(40);
      check(E_grp(t, '1021') !== erG && /closed year/.test(t.meldung()), 'closed 2025: moving one of its accounts into the income statement is refused');
      await t.seite('buchen'); t.leeren();
      t.tippe('#bu-datum', '14.10.2026'); t.tippe('#bu-text', 'After a closed year'); t.tippe('#bu-betrag', '10');
      t.fire(t.tippe('#bu-soll', '4000'), 'keydown', { key: 'Tab' }); t.fire(t.tippe('#bu-haben', '1020'), 'keydown', { key: 'Tab' }); await sleep(10);
      t.$('#bu-ok').click(); await sleep(60);
      check(t.st().buchungen.some(b => b.text === 'After a closed year') && !/Not done/.test(t.meldung()), 'a booking in 2026, after the closed 2025, goes in as always');
      await t.seite('vergleich');
      const jahrKnopf = (j, txt) => t.$$('#vg-jahre tr').filter(tr => (tr.querySelector('td b') || {}).textContent === String(j)).map(tr => Array.from(tr.querySelectorAll('button')).find(b => b.textContent === txt))[0];
      jahrKnopf(2026, 'Close year').click(); await sleep(60); { const b = t.$$('#dlg-frage.on #fr-knoepfe button').pop(); if (b) b.click(); } await sleep(80);
      check(t.st().abgeschlossen.join() === '2025,2026', '2026 closes once 2025 is closed');
      t.leeren(); jahrKnopf(2025, 'Reopen').click(); await sleep(60);
      check(!t.frage() && t.st().abgeschlossen.join() === '2025,2026' && /Reopen 2026 first/.test(t.meldung()), 'reopening 2025 while 2026 is closed: reopen 2026 first');
      jahrKnopf(2026, 'Reopen').click(); await sleep(60); if (t.knopf('Reopen')) t.knopf('Reopen').click(); await sleep(80);
      jahrKnopf(2025, 'Reopen').click(); await sleep(60); if (t.knopf('Reopen')) t.knopf('Reopen').click(); await sleep(80);
      t.leeren(); jahrKnopf(2026, 'Close year').click(); await sleep(60);
      check(!t.frage() && !t.st().abgeschlossen.length && /Close 2025 first/.test(t.meldung()), 'closing 2026 while 2025 is open: close 2025 first');
      /* 5. an account used only by an imported closing cannot be deleted */
      const frei = e.w.VORLAGE.konten.map(k => k[0]).find(nr => !t.st().buchungen.some(b => b.z.some(z => z[0] === nr)) && !Object.values(t.st().einstellungen).includes(nr) && /^1/.test(nr) && !['1020', '1021', '1000'].includes(nr));
      if (!t.st().vergleichsjahre.length) t.st().vergleichsjahre.push(fx.vergleichsjahre[0]);
      t.st().vergleichsjahre[0].salden[frei] = 5;
      await t.seite('konten');
      check(!t.$('button[aria-label="Delete account ' + frei + '"]') && t.$$('.ev-used').some(x => /imported closing 2024/.test(x.title)), 'an account used only by an imported closing cannot be deleted (' + frei + ')');
    }
    function E_grp(t, nr){ const k = t.st().konten.find(x => x[0] === nr); return k && k[2]; }
    /* 6. Lines mode with a foreign-currency account: its fields appear when the account is typed, the rate shown is the
       rate booked (27.7: the USD amount was dropped) */
    { const e = boot(); alle.push(e); await sleep(50); const t = await offen(e, makeFixture(e.w.VORLAGE));
      await t.seite('buchen');
      t.$('#bu-modus button[data-modus="zeilen"]').click(); await sleep(40);
      t.tippe('#bu-text', 'USD in lines');
      t.fire(t.tippe('[data-zl="0"][data-f="k"]', '1020.2'), 'keydown', { key: 'Tab' }); await sleep(20);
      check(!!t.$('[data-zl="0"][data-f="fw"]') && t.$('[data-zl="0"][data-f="kurs"]').value === '0.88' && e.d.activeElement === t.$('[data-zl="0"][data-f="fw"]'),
        'Lines: a USD account typed in brings its amount and rate fields, the cursor in the USD amount');
      t.tippe('[data-zl="0"][data-f="fw"]', '100'); await sleep(10);
      t.fire(t.tippe('[data-zl="1"][data-f="k"]', '1020'), 'keydown', { key: 'Tab' }); await sleep(20);
      t.tippe('[data-zl="1"][data-f="h"]', '88'); await sleep(10);
      t.$('#bu-ok').click(); await sleep(80);
      const b = t.st().buchungen.find(x => x.text === 'USD in lines'), z = b && b.z.find(x => x[0] === '1020.2');
      check(z && z[1] === 88 && z[3] === 100 && z[4] === 0.88, 'Lines: the booking keeps the USD amount and its rate (' + JSON.stringify(z) + ')');
      /* 7. Tab from the last line reaches Add line (27.7: it went straight to the buttons) */
      t.$('#bu-modus button[data-modus="zeilen"]').click(); await sleep(40);
      const letzte = t.$$('#bu-zeilen [data-f="t"]').pop(); letzte.focus();
      const ev = new e.w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }); letzte.dispatchEvent(ev);
      check(ev.defaultPrevented && e.d.activeElement === t.$('#bu-zeile-neu'), 'Lines: Tab from the last line goes to Add line');
      /* 8. the filter: the button says what it covers; Ctrl+Enter in the empty dialog on Book books nothing */
      t.$('#bu-modus button[data-modus="schnell"]').click(); await sleep(40); if (t.knopf('Clear the lines')) t.knopf('Clear the lines').click(); await sleep(40);
      t.tippe('#bu-datum', '14.10.2026'); t.tippe('#bu-text', 'Not booked from the filter'); t.tippe('#bu-betrag', '10');
      t.fire(t.tippe('#bu-soll', '4000'), 'keydown', { key: 'Tab' }); t.fire(t.tippe('#bu-haben', '1020'), 'keydown', { key: 'Tab' }); await sleep(10);
      const n = t.st().buchungen.length;
      e.d.activeElement.dispatchEvent(new e.w.KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })); await sleep(20);
      t.$('#fi-text').dispatchEvent(new e.w.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })); await sleep(40);
      check(t.st().buchungen.length === n && /year in the head/.test(t.$('#jo-filter').title), 'the filter: Ctrl+Enter in its empty dialog books nothing; its button names the year in the head');
    }
    /* 9. the check before saving names what differs; a change that goes through the books writes every line the way
       the file keeps it (a negative amount on the other side), so the next Save works */
    { const e = boot(); alle.push(e); await sleep(50); const t = await offen(e, makeFixture(e.w.VORLAGE));
      t.st().buchungen.push({ id: 'neg1', datum: '2026-10-10', beleg: '', text: 'Negative', z: [['4000', -10, 0], ['1020', 0, -10]] });
      t.leeren(); t.$('#speichern').click(); await sleep(300);
      check(!e.names.length && /found a difference: debit \/ credit/.test(t.meldung()), 'the check before saving names the difference (debit / credit) and writes nothing');
      t.nenne('Test Person, normalised'); await sleep(30);
      t.$('#speichern').click(); await sleep(300);
      const neg = t.st().buchungen.find(b => b.id === 'neg1');
      check(e.names.length === 1 && t.knopfText() === 'Saved' && JSON.stringify(neg.z) === '[["4000",0,10],["1020",10,0]]', 'after a change every line is as the file keeps it, and Save works');
    }
    /* 10. fields this version does not know survive opening, saving and editing; duplicate IDs get free names */
    { const e = boot(); alle.push(e); await sleep(50);
      const fx = makeFixture(e.w.VORLAGE), i = fx.buchungen.findIndex(b => b.datum === '2026-03-01');
      fx.extraOben = { x: 1 }; fx.buchungen[i].notiz = 'kept'; fx.buchungen[i].z[0] = fx.buchungen[i].z[0].concat([0, 0, '', 'line extra']);
      fx.konten[0] = fx.konten[0].concat(['account extra']);
      fx.vergleichsjahre = [{ jahr: 2023, quelle: 'Import', importiert: '2024-01-01', salden: { '1020': 100, '2800': -100 }, extra: 'kept' }];
      fx.buchungen[0].id = 'r0003'; fx.buchungen[1].id = 'dup'; fx.buchungen[2].id = 'dup';     // 27.7 renamed the second 'dup' to r0003
      const t = await offen(e, fx);
      t.$('#speichern').click(); await sleep(300);
      const x = JSON.parse(await readBlob(e, e.blobs[e.blobs.length - 1]));
      const b = x.buchungen.find(y => y.datum === '2026-03-01' && y.notiz) || x.buchungen.find(y => y.datum === '2026-03-01' && /^Rent/.test(y.text));
      check(x.extraOben && b && b.notiz === 'kept' && b.z[0][6] === 'line extra' && x.konten[0][5] === 'account extra' && x.vergleichsjahre[0].extra === 'kept',
        'fields of another version survive open and save: at the top, in a booking, a line, an account, an imported closing');
      check(new Set(x.buchungen.map(y => y.id)).size === x.buchungen.length, 'duplicate booking IDs get names no other booking has');
      await t.seite('journal');
      t.$('#jo-liste tr[data-edit="' + b.id + '"]').click(); await sleep(60);
      t.tippe('#bu-text', 'Rent, edited'); t.$('#bu-ok').click(); await sleep(60);
      const nach = t.st().buchungen.find(y => y.id === b.id);
      check(nach.text === 'Rent, edited' && nach.notiz === 'kept', 'editing a booking keeps what the form does not show');
    }
    /* 11. iPad: a share sheet that cannot take the file saves nothing and downloads nothing (27.7: it downloaded and
       called it saved) */
    { const e = boot({ teilen: 'nein' }); alle.push(e); await sleep(50); const t = await offen(e, makeFixture(e.w.VORLAGE));
      t.nenne('Changed on the iPad'); await sleep(30); t.leeren();
      t.$('#speichern').click(); await sleep(300);
      check(!e.names.length && !e.geteilt.length && t.knopfText() === 'Save' && /could not take the file/.test(t.meldung()), 'iPad: the share sheet refused: nothing saved, nothing downloaded, still unsaved');
    }
    /* 12. Save to folder: a booking made while the folder save writes gives no false error and no false question
       (27.7: "Not saved to the folder", then "Saved elsewhere since you opened it" about its own file) */
    const ordnerFenster = async () => {
      const app = fakeDir('EVEN'), bkp = fakeDir('02 BACKUP'); app.kids.set('02 BACKUP', bkp);
      const alt = fakeFile('2026-10-13_EVEN.json'); app.kids.set(alt.name, alt);
      const e = boot({ oeffne: alt, ordner: app }); alle.push(e); await sleep(50);
      { const x = makeFixture(e.w.VORLAGE); x.saved = '2026-10-13T19:00:00.000Z'; alt._t = JSON.stringify(x); }
      e.d.getElementById('s-oeffnen').click(); await sleep(150); const t = T(e); await t.weg();
      t.$('#ordner').click(); await sleep(30); t.$('#od-app').click(); await sleep(200);
      if (t.knopf('Close')) t.knopf('Close').click(); await sleep(40);
      return { e, t, app, bkp };
    };
    { const { t, app } = await ordnerFenster();
      await t.seite('buchen');
      t.tippe('#bu-text', 'Booked while saving'); t.tippe('#bu-betrag', '10');
      t.fire(t.tippe('#bu-soll', '4000'), 'keydown', { key: 'Tab' }); t.fire(t.tippe('#bu-haben', '1020'), 'keydown', { key: 'Tab' }); await sleep(10);
      t.leeren(); t.$('#speichern').click(); t.$('#bu-ok').click(); await sleep(600);
      check(/Saved to EVEN/.test(t.meldung()) && !/Not saved/.test(t.meldung()) && t.knopfText() === 'Save', 'Save to folder with a booking made meanwhile: saved, no false error, the booking stays unsaved');
      t.$('#speichern').click(); await sleep(500);
      const heute = JSON.parse(app.kids.get('2026-10-14_EVEN.json')._t);
      check(!t.frage() && heute.buchungen.some(b => b.text === 'Booked while saving') && t.knopfText() === 'Saved', 'the next save goes straight into today’s file, no question, with the booking');
    }
    /* 13. Save to folder, "Save as a new file" twice in a day: the second copy gets its own name (27.7: it replaced the
       first, which was in no backup) */
    { const { e, t, app } = await ordnerFenster();
      const fremd = () => { const fh = app.kids.get('2026-10-14_EVEN.json') || fakeFile('2026-10-14_EVEN.json'); const x = makeFixture(e.w.VORLAGE); x.saved = '2026-10-14T23:00:00.000Z'; fh._t = JSON.stringify(x); app.kids.set(fh.name, fh); };
      fremd(); t.nenne('First copy'); await sleep(30);
      t.$('#speichern').click(); await sleep(300); if (t.knopf('Save as a new file')) t.knopf('Save as a new file').click(); await sleep(400);
      fremd(); t.nenne('Second copy'); await sleep(30);
      t.$('#speichern').click(); await sleep(300); if (t.knopf('Save as a new file')) t.knopf('Save as a new file').click(); await sleep(400);
      const m = n => app.kids.get(n) && JSON.parse(app.kids.get(n)._t).mandant;
      check(m('2026-10-14_EVEN COPY.json') === 'First copy' && m('2026-10-14_EVEN COPY 2.json') === 'Second copy', 'a second copy on the same day goes next to the first: “… EVEN COPY 2.json”');
    }
    /* 14. writing into the opened file is read back: a file that does not hold what was written is reported and the
       window stays unsaved */
    { const disk = fakeFile('2026-10-14_EVEN.json'), e = boot({ oeffne: disk }); alle.push(e); await sleep(50);
      disk._t = JSON.stringify(makeFixture(e.w.VORLAGE));
      e.d.getElementById('s-oeffnen').click(); await sleep(150); const t = T(e); await t.weg();
      disk.createWritable = async () => ({ write: async () => {}, close: async () => { disk._t = '{"cut off'; } });
      t.nenne('Not written'); await sleep(30); t.leeren();
      t.$('#speichern').click(); await sleep(300);
      check(/did not read back the same/.test(t.meldung()) && t.knopfText() === 'Save', 'a write that does not read back is reported; the window stays unsaved');
    }
    /* 15. each window keeps its own working copy (27.7: one for all; window B opening a file deleted window A's) */
    { const sp = {}, locks = new Set(), fxt = e => JSON.stringify(makeFixture(e.w.VORLAGE));
      const A = boot({ idb: sp, locks }); alle.push(A); await sleep(50); const tA = await offen(A, makeFixture(A.w.VORLAGE), 'a.json');
      tA.nenne('Unsaved in window A'); await sleep(1400);
      const B = boot({ idb: sp, locks }); alle.push(B); await sleep(150);
      check(kopien(sp).length === 1 && !B.d.getElementById('s-weiter'), 'another window that is still open: its unsaved changes are not offered on the start screen');
      const tB = await offen(B, makeFixture(B.w.VORLAGE), 'b.json');
      tB.nenne('Saved in window B'); await sleep(30); tB.$('#speichern').click(); await sleep(300);
      check(kopien(sp).length === 1 && kopie(sp).daten.mandant === 'Unsaved in window A', 'window B opens and saves another file: window A’s working copy stays');
      A.freigeben(); A.dom.window.close();
      sp.buchhaltung.set('arbeitskopie', { at: '2026-10-13T08:00:00.000Z', name: 'old.json', basis: null, daten: JSON.parse(fxt(B)) });
      const C = boot({ idb: sp, locks }); alle.push(C); await sleep(150);
      check(C.d.querySelectorAll('#start .ev-weiter').length === 2 && /based on a\.json/.test(C.d.getElementById('s-weiter').textContent),
        'after window A is gone, the start screen offers its changes (newest first) and the copy of an earlier build');
    }
    /* 16. a restored working copy saved through the picker onto a file saved elsewhere since: Save asks first */
    { const disk = fakeFile('2026-10-14_EVEN.json'), sp = {}, T0 = '2026-10-13T19:00:00.000Z', T1 = '2026-10-14T07:00:00.000Z';
      const e = boot({ idb: sp, oeffne: disk, speichereIn: disk }); alle.push(e);
      { const x = makeFixture(e.w.VORLAGE); x.saved = T1; disk._t = JSON.stringify(x);
        const d = makeFixture(e.w.VORLAGE); d.saved = T0; d.mandant = 'Restored';
        sp.buchhaltung = new Map([['arbeitskopie:crashed', { at: '2026-10-14T09:00:00.000Z', name: '2026-10-14_EVEN.json', basis: T0, daten: d }]]); }
      await sleep(150); const t = T(e);
      const weiter = t.$('#s-weiter'); if (weiter) weiter.click(); await sleep(200); await t.weg();
      t.$('#speichern').click(); await sleep(300);
      check(!!weiter && t.frage() === 'Saved elsewhere since you opened it', 'a restored copy, Save through the picker onto a file saved elsewhere since: asks first');
      if (t.knopf('Cancel')) t.knopf('Cancel').click(); await sleep(60);
      check(JSON.parse(disk._t).saved === T1, 'Cancel leaves that file as it was');
    }
    alle.forEach(e => env.errors.push(...e.errors));
  }

  check(env.errors.length === 0, 'no script errors' + (env.errors.length ? ': ' + env.errors.slice(0, 3).join(' | ') : ''));
  console.log((bad ? 'FAILED ' : 'OK ') + ok + ' of ' + (ok + bad) + ' checks passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('CRASH ' + (e && e.stack || e)); process.exit(1); });
